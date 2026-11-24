import { ownerPage } from "../utils/ownerPage.js";
import mongoose from "mongoose";
import SaleRequest, { CLOSED_SALE_STATUSES } from "../models/SaleRequest.js";
import Offer from "../models/Offer.js";
import Payment from "../models/Payment.js";
import Property from "../models/Property.js";
import { postSystemNote } from "./chatController.js";
import {
  canManageRecord,
  formatGHS,
  isOwnListing,
  loadPublishedProperty,
  ownerFilter,
  ownerName,
  REQUEST_PROPERTY_FIELDS,
  same,
} from "../utils/ownership.js";
import { notifyOwner, notifyUser } from "../utils/notify.js";
import { newReference } from "../utils/paystack.js";
import { cleanText, validateContact } from "../utils/validation.js";
import { HttpError, ok, fail } from "../utils/response.js";
import { siteName } from "../models/Setting.js";
import { openRequestLimitProblem } from "../utils/openRequestLimits.js";
import { buildReceipt, deliverReceipt, presentReceipt } from "../utils/receipts.js";
import { OFFICE_METHOD } from "../utils/officePayments.js";

const LABELS = {
  pending: "pending",
  contacted: "contacted",
  offer_received: "offer received",
  negotiating: "negotiating",
  approved: "approved",
  payment_pending: "awaiting payment",
  paid_at_office: "payment received",
  completed: "completed",
  cancelled: "cancelled",
  rejected: "rejected",
};
// Statuses the owner can set directly; paid_at_office and completed have their own confirmed actions
const SETTABLE = [
  "contacted",
  "offer_received",
  "negotiating",
  "approved",
  "payment_pending",
  "cancelled",
  "rejected",
];

const populate = (query) =>
  query
    .populate("property", REQUEST_PROPERTY_FIELDS)
    .populate("customer", "firstName lastName")
    .populate("owner", "firstName lastName")
    .populate("paymentConfirmedBy", "firstName lastName role")
    .populate("history.by", "firstName lastName role");

// Latest offer (not withdrawn) each customer made on each property, for "Offer amount if applicable"
const latestOffers = async (requests) => {
  if (!requests.length) return new Map();
  const offers = await Offer.find({
    $or: requests.map((r) => ({
      customer: r.customer?._id || r.customer,
      property: r.property?._id || r.property,
    })),
    status: { $ne: "withdrawn" },
  }).sort({ createdAt: -1 });
  const map = new Map();
  offers.forEach((o) => {
    const key = `${o.customer}:${o.property}`;
    if (!map.has(key))
      map.set(key, {
        amount: o.amount,
        status: o.status,
        counterAmount: o.counterAmount,
      });
  });
  return map;
};

const present = (request, user, offers = new Map()) => {
  const r = request.toJSON();
  const by = (u) =>
    u?._id ? { name: `${u.firstName} ${u.lastName}`, role: u.role } : null;
  return {
    ...r,
    customer: request.customer?._id
      ? {
          id: String(request.customer._id),
          name: `${request.customer.firstName} ${request.customer.lastName}`,
        }
      : { id: String(request.customer) },
    owner: {
      id:
        request.ownerType === "admin"
          ? "admin"
          : String(request.owner?._id || request.owner),
      name: ownerName(request),
      type: request.ownerType,
    },
    paymentConfirmedBy: by(request.paymentConfirmedBy),
    history: request.history.map((h) => ({
      status: h.status,
      paymentStatus: h.paymentStatus,
      note: h.note,
      at: h.at,
      by: by(h.by),
    })),
    offer:
      offers.get(
        `${request.customer?._id || request.customer}:${request.property?._id || request.property}`,
      ) || null,
    conversation: request.conversation ? String(request.conversation) : null,
    receipt: presentReceipt(request.receipt),
    canManage: canManageRecord(request, user),
  };
};

const respond = async (res, id, user, message, status = 200) => {
  const request = await populate(SaleRequest.findById(id));
  ok(
    res,
    present(request, user, await latestOffers([request])),
    message,
    status,
  );
};

const addHistory = (doc, user, note) =>
  doc.history.push({
    status: doc.status,
    paymentStatus: doc.paymentStatus,
    note,
    by: user._id,
  });

// Posts the change into the customer/owner chat so the conversation shows the whole story
// (property defaults to the populated one; a new request passes the property it just loaded)
// Inside a transaction, pass its `session` so the note commits (or rolls back) with the change.
const note = async (request, user, side, text, property = request.property, session = null) => {
  if (!property?.owner) return;
  const conversation = await postSystemNote(
    property,
    request.customer._id || request.customer,
    user,
    side,
    text,
    session,
  );
  request.conversation = conversation._id;
};

// Loads a request the signed-in account manages (owning agent, or admin)
const loadManaged = async (req, res) => {
  const request = mongoose.isValidObjectId(req.params.id)
    ? await populate(SaleRequest.findById(req.params.id))
    : null;
  if (!request || !canManageRecord(request, req.user)) {
    fail(res, 404, "Purchase request not found.");
    return null;
  }
  if (CLOSED_SALE_STATUSES.includes(request.status)) {
    fail(
      res,
      400,
      `This purchase request is already ${LABELS[request.status]}.`,
    );
    return null;
  }
  return request;
};

// POST /api/sale-requests { propertyId, fullName, email, phone, message } -> "Buy Now"
export const createSaleRequest = async (req, res) => {
  const contact = validateContact({ ...req.body, email: req.user.email });
  if (contact.error) return fail(res, 400, contact.error);

  const property = await loadPublishedProperty(req.body.propertyId);
  if (!property) return fail(res, 404, "This property is not available.");
  if (property.listingType !== "Sale")
    return fail(res, 400, "This property is for rent. Use Rent Now instead.");
  if (property.availability === "Sold")
    return fail(res, 400, "This property has already been sold.");
  if (isOwnListing(property, req.user))
    return fail(res, 400, "This is your own listing.");

  const tooMany = await openRequestLimitProblem("sales", req.user._id, property._id);
  if (tooMany) return fail(res, 429, tooMany);
  const open = await SaleRequest.exists({
    customer: req.user._id,
    property: property._id,
    status: { $nin: CLOSED_SALE_STATUSES },
  });
  if (open)
    return fail(
      res,
      409,
      "You already have an open purchase request for this property. Track it in My Purchases.",
    );

  const { contactName, contactEmail, contactPhone } = contact;
  // The request and its chat note are saved together (the chat never mentions an unsaved request)
  const request = await mongoose.connection.transaction(async (session) => {
    const created = new SaleRequest({
      customer: req.user._id,
      property: property._id,
      owner: property.owner, // from the database, never the request
      assignedTo: property.assignedTo || null, // the agency staff member handling the listing
      ownerType: property.ownerType,
      askingPrice: property.price,
      contactName,
      contactEmail,
      contactPhone,
      message: cleanText(req.body.message),
    });
    addHistory(created, req.user, "Purchase request submitted");
    await note(
      created,
      req.user,
      "customer",
      [
        `Purchase request submitted for ${formatGHS(property.price)}.`,
        created.message,
      ]
        .filter(Boolean)
        .join("\n\n"),
      property,
      session,
    );
    await created.save({ session });
    return created;
  });

  await Promise.all([
    notifyUser(req.user._id, {
      type: "sale",
      title: "Purchase request submitted",
      message: `The owner of "${property.title}" will contact you to agree on next steps and how to pay. Don't make any payment until you've agreed the details with them.`,
      link: "/account/purchases",
    }),
    notifyOwner(request, {
      type: "sale",
      title: "New purchase request",
      message: `${request.contactName} wants to buy "${property.title}".`,
      path: "sale-requests",
    }),
  ]);
  await respond(res, request._id, req.user, "Purchase request submitted", 201);
};

// GET /api/sale-requests/my
export const mySaleRequests = async (req, res) => {
  const requests = await populate(
    SaleRequest.find({ customer: req.user._id }).sort({ createdAt: -1 }),
  );
  const offers = await latestOffers(requests);
  ok(
    res,
    requests.map((r) => present(r, req.user, offers)),
  );
};

// GET /api/agents/sale-requests and /api/admin/sale-requests (admins see all)
export const ownerSaleRequests = async (req, res) => {
  const closed = ["completed", "cancelled", "rejected"];
  ok(
    res,
    await ownerPage(req, {
      Model: SaleRequest,
      tab: "open",
      fields: ["contactName", "contactEmail", "contactPhone"],
      tabs: {
        open: { status: { $nin: closed } },
        payment: { status: "payment_pending" },
        completed: { status: "completed" },
        closed: { status: { $in: ["cancelled", "rejected"] } },
        all: {},
      },
      stats: {
        open: { status: { $nin: closed } },
        payment: { status: "payment_pending" },
        received: { paymentStatus: "confirmed", status: { $nin: closed } },
        completed: { status: "completed" },
      },
      load: async (query) => {
        const requests = await populate(query);
        const offers = await latestOffers(requests);
        return requests.map((r) => present(r, req.user, offers));
      },
    }),
  );
};

// GET /api/sale-requests/:id
export const getSaleRequest = async (req, res) => {
  const request = mongoose.isValidObjectId(req.params.id)
    ? await populate(SaleRequest.findById(req.params.id))
    : null;
  if (
    !request ||
    !(same(request.customer, req.user) || canManageRecord(request, req.user))
  )
    return fail(res, 404, "Purchase request not found.");
  ok(res, present(request, req.user, await latestOffers([request])));
};

// PATCH /api/sale-requests/:id/status { status, note } -> owner side
export const updateSaleStatus = async (req, res) => {
  const request = await loadManaged(req, res);
  if (!request) return;
  const { status } = req.body;
  if (!SETTABLE.includes(status))
    return fail(res, 400, "Choose a valid status.");
  if (status === request.status)
    return fail(res, 400, `This request is already ${LABELS[status]}.`);
  if (
    request.paymentStatus === "confirmed" &&
    ["cancelled", "rejected", "payment_pending"].includes(status)
  ) {
    return fail(
      res,
      400,
      "The office payment is already confirmed. Complete the sale instead.",
    );
  }

  const reason = cleanText(req.body.note, 300);
  request.status = status;
  if (status === "payment_pending") request.paymentStatus = "payment_requested";
  if (
    ["cancelled", "rejected"].includes(status) &&
    request.paymentStatus === "payment_requested"
  )
    request.paymentStatus = "failed";
  addHistory(
    request,
    req.user,
    reason || `Status changed to ${LABELS[status]}`,
  );

  const customerText =
    status === "payment_pending"
      ? `Payment requested: pay ${formatGHS(request.askingPrice)} at ${ownerName(request)}'s office. ${siteName()} never takes house or land payments online, and nobody should ask you to pay to a personal or mobile money number. You get a receipt when the payment is recorded.`
      : `Your purchase request is now ${LABELS[status]}.`;
  await note(
    request,
    req.user,
    "owner",
    [customerText, reason].filter(Boolean).join("\n\n"),
  );
  await request.save();

  await notifyUser(request.customer._id, {
    type: status === "payment_pending" ? "payment" : "status",
    title:
      status === "payment_pending"
        ? "Payment requested"
        : `Purchase request ${LABELS[status]}`,
    message: `${customerText} (${request.property?.title || "property"})`,
    link: "/account/purchases",
  });
  await respond(res, request._id, req.user, "Purchase request updated");
};

// PATCH /api/sale-requests/:id/confirm-payment { amount, note, reference } -> owner records the buyer's
// payment at the office; the buyer's receipt is issued with it
export const confirmOfficePayment = async (req, res) => {
  const request = await loadManaged(req, res);
  if (!request) return;
  if (request.paymentStatus === "confirmed")
    return fail(res, 400, "This payment is already confirmed.");
  const amount =
    req.body.amount === undefined || req.body.amount === ""
      ? request.askingPrice
      : Math.round(Number(req.body.amount));
  if (!Number.isFinite(amount) || amount < 1)
    return fail(res, 400, "Enter the amount received.");
  const reason = cleanText(req.body.note, 300);
  const slip = cleanText(req.body.reference, 80); // e.g. the bank slip or cheque number, if any

  const now = new Date();
  let receipt;
  // One transaction: the request is confirmed, the payment recorded and the chat noted together, or
  // nothing changes. The claim comes first so a double click or two staff members confirming at once
  // conflict on it: one commits, the other retries, finds it confirmed and gets the 409.
  await mongoose.connection.transaction(async (session) => {
    const claimed = await SaleRequest.findOneAndUpdate(
      { _id: request._id, paymentStatus: { $ne: "confirmed" }, status: { $nin: CLOSED_SALE_STATUSES } },
      { $set: { paymentStatus: "confirmed", paymentConfirmedAt: now, paymentConfirmedBy: req.user._id } },
      { returnDocument: "after", session },
    );
    if (!claimed) throw new HttpError(409, "This payment was just confirmed, or the request changed. Refresh it.");
    await Payment.create([{
      kind: "sale",
      saleRequest: request._id,
      customer: request.customer._id,
      property: request.property?._id || request.property,
      owner: request.owner?._id || request.owner,
      ownerType: request.ownerType,
      amount,
      method: "Office", // houses and land are paid for at the office
      reference: newReference("HBS"),
      status: "paid",
      paidAt: now,
      confirmedBy: req.user._id,
      note: reason,
    }], { session });

    claimed.set({ status: "paid_at_office", amountPaid: amount });
    claimed.receipt = await buildReceipt({ ...claimed.toObject(), owner: request.owner }, {
      amount, method: OFFICE_METHOD, paymentReference: slip, note: reason,
      description: `Payment for "${request.property?.title || "the property"}"`, issuer: req.user, now, session,
    });
    receipt = claimed.receipt;
    addHistory(
      claimed,
      req.user,
      `Payment of ${formatGHS(amount)} received at the office; receipt ${claimed.receipt.number}${reason ? ` – ${reason}` : ""}`,
    );
    await note(
      claimed,
      req.user,
      "owner",
      `Payment of ${formatGHS(amount)} received at the office. Receipt ${claimed.receipt.number} was sent to you.`,
      request.property,
      session,
    );
    await claimed.save({ session });
  });

  await deliverReceipt({ customer: request.customer._id, email: request.contactEmail, receipt, link: "/account/purchases" });
  await respond(res, request._id, req.user, "Payment recorded and receipt sent");
};

// PATCH /api/sale-requests/:id/complete -> marks the property sold (after the owner confirms the payment)
export const completeSale = async (req, res) => {
  const request = await loadManaged(req, res);
  if (!request) return;
  if (request.paymentStatus !== "confirmed")
    return fail(
      res,
      400,
      "Confirm the buyer's payment before completing the sale.",
    );

  const propertyId = request.property?._id || request.property;
  // One transaction: the sale is completed, the property marked sold and the other buyers' requests
  // and offers closed together. Reloaded inside it, so completing twice (a double click) is refused.
  const cancelledBuyers = await mongoose.connection.transaction(async (session) => {
    const current = await SaleRequest.findOne({ _id: request._id, paymentStatus: "confirmed", status: { $nin: CLOSED_SALE_STATUSES } }).session(session);
    if (!current) throw new HttpError(409, "This sale was already completed, or the request changed. Refresh it.");
    current.status = "completed";
    addHistory(current, req.user, "Sale completed; property marked as sold");
    await note(
      current,
      req.user,
      "owner",
      "Sale completed. Congratulations on your new property!",
      request.property,
      session,
    );
    await current.save({ session });

    // The property stays listed (with its history) but is marked sold, which blocks new requests and offers
    await Property.updateOne({ _id: propertyId }, { availability: "Sold" }, { session });

    // Other buyers' open requests and offers on this property are closed
    const others = await SaleRequest.find({
      property: propertyId,
      _id: { $ne: request._id },
      status: { $nin: CLOSED_SALE_STATUSES },
    }).session(session);
    for (const other of others) {
      other.status = "cancelled";
      if (other.paymentStatus === "payment_requested")
        other.paymentStatus = "failed";
      addHistory(other, req.user, "Property sold to another buyer");
      await other.save({ session });
    }
    await Offer.updateMany(
      { property: propertyId, status: { $in: ["pending", "countered"] } },
      { status: "rejected", response: "Property sold", respondedAt: new Date() },
      { session },
    );
    return others.map((other) => other.customer);
  });

  // Told only once everything above is saved
  for (const buyer of cancelledBuyers) {
    await notifyUser(buyer, {
      type: "status",
      title: "Property no longer available",
      message: `"${request.property?.title}" has been sold.`,
      link: "/account/purchases",
    });
  }

  await notifyUser(request.customer._id, {
    type: "status",
    title: "Purchase completed",
    message: `The sale of "${request.property?.title}" is complete.`,
    link: "/account/purchases",
  });
  await respond(res, request._id, req.user, "Sale completed");
};

// PATCH /api/sale-requests/:id/cancel -> the customer withdraws their own request
export const cancelSaleRequest = async (req, res) => {
  const request = mongoose.isValidObjectId(req.params.id)
    ? await populate(SaleRequest.findById(req.params.id))
    : null;
  if (!request || !same(request.customer, req.user))
    return fail(res, 404, "Purchase request not found.");
  if (CLOSED_SALE_STATUSES.includes(request.status))
    return fail(
      res,
      400,
      `This purchase request is already ${LABELS[request.status]}.`,
    );
  if (request.paymentStatus === "confirmed")
    return fail(
      res,
      400,
      "Your payment is already confirmed. Contact the owner to make changes.",
    );

  request.status = "cancelled";
  if (request.paymentStatus === "payment_requested")
    request.paymentStatus = "failed";
  addHistory(request, req.user, "Cancelled by the customer");
  await note(
    request,
    req.user,
    "customer",
    "I've cancelled my purchase request.",
  );
  await request.save();
  await notifyOwner(request, {
    type: "sale",
    title: "Purchase request cancelled",
    message: `${request.contactName} cancelled their request for "${request.property?.title}".`,
    path: "sale-requests",
  });
  await respond(res, request._id, req.user, "Purchase request cancelled");
};
