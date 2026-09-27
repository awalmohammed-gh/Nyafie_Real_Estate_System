import mongoose from "mongoose";
import SaleRequest, { CLOSED_SALE_STATUSES } from "../models/SaleRequest.js";
import Offer from "../models/Offer.js";
import Payment from "../models/Payment.js";
import Property from "../models/Property.js";
import { postSystemNote } from "./chatController.js";
import { canManageRecord, formatGHS, isOwnListing, loadPublishedProperty, ownerFilter, ownerName, same } from "../utils/ownership.js";
import { notifyOwner, notifyUser } from "../utils/notify.js";
import { newReference } from "../utils/paystack.js";
import { cleanText, validateContact } from "../utils/validation.js";
import { ok, fail } from "../utils/response.js";
import { siteName } from "../models/Setting.js";

const PROPERTY_FIELDS = "title images location price pricePeriod listingType status availability owner ownerType contact";
const LABELS = {
  pending: "pending",
  contacted: "contacted",
  offer_received: "offer received",
  negotiating: "negotiating",
  approved: "approved",
  payment_pending: "awaiting payment at the office",
  paid_at_office: "paid at the office",
  completed: "completed",
  cancelled: "cancelled",
  rejected: "rejected",
};
// Statuses the owner can set directly; paid_at_office and completed have their own confirmed actions
const SETTABLE = ["contacted", "offer_received", "negotiating", "approved", "payment_pending", "cancelled", "rejected"];

const populate = (query) =>
  query
    .populate("property", PROPERTY_FIELDS)
    .populate("customer", "firstName lastName")
    .populate("owner", "firstName lastName")
    .populate("paymentConfirmedBy", "firstName lastName role")
    .populate("history.by", "firstName lastName role");

// Latest offer (not withdrawn) each customer made on each property, for "Offer amount if applicable"
const latestOffers = async (requests) => {
  if (!requests.length) return new Map();
  const offers = await Offer.find({
    $or: requests.map((r) => ({ customer: r.customer?._id || r.customer, property: r.property?._id || r.property })),
    status: { $ne: "withdrawn" },
  }).sort({ createdAt: -1 });
  const map = new Map();
  offers.forEach((o) => {
    const key = `${o.customer}:${o.property}`;
    if (!map.has(key)) map.set(key, { amount: o.amount, status: o.status, counterAmount: o.counterAmount });
  });
  return map;
};

const present = (request, user, offers = new Map()) => {
  const r = request.toJSON();
  const by = (u) => (u?._id ? { name: `${u.firstName} ${u.lastName}`, role: u.role } : null);
  return {
    ...r,
    customer: request.customer?._id ? { id: String(request.customer._id), name: `${request.customer.firstName} ${request.customer.lastName}` } : { id: String(request.customer) },
    owner: { id: request.ownerType === "admin" ? "admin" : String(request.owner?._id || request.owner), name: ownerName(request), type: request.ownerType },
    paymentConfirmedBy: by(request.paymentConfirmedBy),
    history: request.history.map((h) => ({ status: h.status, paymentStatus: h.paymentStatus, note: h.note, at: h.at, by: by(h.by) })),
    offer: offers.get(`${request.customer?._id || request.customer}:${request.property?._id || request.property}`) || null,
    conversation: request.conversation ? String(request.conversation) : null,
    canManage: canManageRecord(request, user),
  };
};

const respond = async (res, id, user, message, status = 200) => {
  const request = await populate(SaleRequest.findById(id));
  ok(res, present(request, user, await latestOffers([request])), message, status);
};

const addHistory = (doc, user, note) => doc.history.push({ status: doc.status, paymentStatus: doc.paymentStatus, note, by: user._id });

// Posts the change into the customer/owner chat so the conversation shows the whole story
// (property defaults to the populated one; a new request passes the property it just loaded)
const note = async (request, user, side, text, property = request.property) => {
  if (!property?.owner) return;
  const conversation = await postSystemNote(property, request.customer._id || request.customer, user, side, text);
  request.conversation = conversation._id;
};

// Loads a request the signed-in account manages (owning agent, or admin)
const loadManaged = async (req, res) => {
  const request = mongoose.isValidObjectId(req.params.id) ? await populate(SaleRequest.findById(req.params.id)) : null;
  if (!request || !canManageRecord(request, req.user)) {
    fail(res, 404, "Purchase request not found.");
    return null;
  }
  if (CLOSED_SALE_STATUSES.includes(request.status)) {
    fail(res, 400, `This purchase request is already ${LABELS[request.status]}.`);
    return null;
  }
  return request;
};

// POST /api/sale-requests { propertyId, fullName, email, phone, message } -> "Buy Now"
export const createSaleRequest = async (req, res) => {
  const contact = validateContact(req.body);
  if (contact.error) return fail(res, 400, contact.error);

  const property = await loadPublishedProperty(req.body.propertyId);
  if (!property) return fail(res, 404, "This property is not available.");
  if (property.listingType !== "Sale") return fail(res, 400, "This property is for rent. Use Rent Now instead.");
  if (property.availability === "Sold") return fail(res, 400, "This property has already been sold.");
  if (isOwnListing(property, req.user)) return fail(res, 400, "This is your own listing.");

  const open = await SaleRequest.exists({ customer: req.user._id, property: property._id, status: { $nin: CLOSED_SALE_STATUSES } });
  if (open) return fail(res, 409, "You already have an open purchase request for this property. Track it in My Purchases.");

  const { contactName, contactEmail, contactPhone } = contact;
  const request = new SaleRequest({
    customer: req.user._id,
    property: property._id,
    owner: property.owner, // from the database, never the request
    ownerType: property.ownerType,
    askingPrice: property.price,
    contactName,
    contactEmail,
    contactPhone,
    message: cleanText(req.body.message),
  });
  addHistory(request, req.user, "Purchase request submitted");
  await note(request, req.user, "customer", [`Purchase request submitted for ${formatGHS(property.price)}.`, request.message].filter(Boolean).join("\n\n"), property);
  await request.save();

  await Promise.all([
    notifyUser(req.user._id, {
      type: "sale",
      title: "Purchase request submitted",
      message: `The owner of "${property.title}" will contact you with next steps. Don't make any payment until you receive confirmation.`,
      link: "/account/purchases",
    }),
    notifyOwner(request, { type: "sale", title: "New purchase request", message: `${request.contactName} wants to buy "${property.title}".`, path: "sale-requests" }),
  ]);
  await respond(res, request._id, req.user, "Purchase request submitted", 201);
};

// GET /api/sale-requests/my
export const mySaleRequests = async (req, res) => {
  const requests = await populate(SaleRequest.find({ customer: req.user._id }).sort({ createdAt: -1 }));
  const offers = await latestOffers(requests);
  ok(res, requests.map((r) => present(r, req.user, offers)));
};

// GET /api/agents/sale-requests and /api/admin/sale-requests (admins see all)
export const ownerSaleRequests = async (req, res) => {
  const requests = await populate(SaleRequest.find(ownerFilter(req.user)).sort({ createdAt: -1 }));
  const offers = await latestOffers(requests);
  ok(res, requests.map((r) => present(r, req.user, offers)));
};

// GET /api/sale-requests/:id
export const getSaleRequest = async (req, res) => {
  const request = mongoose.isValidObjectId(req.params.id) ? await populate(SaleRequest.findById(req.params.id)) : null;
  if (!request || !(same(request.customer, req.user) || canManageRecord(request, req.user))) return fail(res, 404, "Purchase request not found.");
  ok(res, present(request, req.user, await latestOffers([request])));
};

// PATCH /api/sale-requests/:id/status { status, note } -> owner side
export const updateSaleStatus = async (req, res) => {
  const request = await loadManaged(req, res);
  if (!request) return;
  const { status } = req.body;
  if (!SETTABLE.includes(status)) return fail(res, 400, "Choose a valid status.");
  if (status === request.status) return fail(res, 400, `This request is already ${LABELS[status]}.`);
  if (request.paymentStatus === "confirmed" && ["cancelled", "rejected", "payment_pending"].includes(status)) {
    return fail(res, 400, "The office payment is already confirmed. Complete the sale instead.");
  }

  const reason = cleanText(req.body.note, 300);
  request.status = status;
  if (status === "payment_pending") request.paymentStatus = "payment_requested";
  if (["cancelled", "rejected"].includes(status) && request.paymentStatus === "payment_requested") request.paymentStatus = "failed";
  addHistory(request, req.user, reason || `Status changed to ${LABELS[status]}`);

  const customerText =
    status === "payment_pending"
      ? `Payment requested: please pay ${formatGHS(request.askingPrice)} at the ${siteName()} office as instructed by ${ownerName(request)}. Only pay at the office.`
      : `Your purchase request is now ${LABELS[status]}.`;
  await note(request, req.user, "owner", [customerText, reason].filter(Boolean).join("\n\n"));
  await request.save();

  await notifyUser(request.customer._id, {
    type: status === "payment_pending" ? "payment" : "status",
    title: status === "payment_pending" ? "Payment requested" : `Purchase request ${LABELS[status]}`,
    message: `${customerText} (${request.property?.title || "property"})`,
    link: "/account/purchases",
  });
  await respond(res, request._id, req.user, "Purchase request updated");
};

// PATCH /api/sale-requests/:id/confirm-payment { amount, note } -> owner confirms the customer paid at the office
export const confirmOfficePayment = async (req, res) => {
  const request = await loadManaged(req, res);
  if (!request) return;
  if (request.paymentStatus === "confirmed") return fail(res, 400, "This payment is already confirmed.");
  const amount = req.body.amount === undefined || req.body.amount === "" ? request.askingPrice : Math.round(Number(req.body.amount));
  if (!Number.isFinite(amount) || amount < 1) return fail(res, 400, "Enter the amount received.");
  const reason = cleanText(req.body.note, 300);

  const now = new Date();
  await Payment.create({
    kind: "sale",
    saleRequest: request._id,
    customer: request.customer._id,
    property: request.property?._id || request.property,
    owner: request.owner?._id || request.owner,
    ownerType: request.ownerType,
    amount,
    method: "Office",
    reference: newReference("HBS"),
    status: "paid",
    paidAt: now,
    confirmedBy: req.user._id,
    note: reason,
  });

  request.set({ status: "paid_at_office", paymentStatus: "confirmed", amountPaid: amount, paymentConfirmedBy: req.user._id, paymentConfirmedAt: now });
  addHistory(request, req.user, `Office payment of ${formatGHS(amount)} confirmed${reason ? ` – ${reason}` : ""}`);
  await note(request, req.user, "owner", `Payment of ${formatGHS(amount)} received at the office and confirmed.`);
  await request.save();

  await notifyUser(request.customer._id, {
    type: "payment",
    title: "Office payment confirmed",
    message: `Your payment of ${formatGHS(amount)} for "${request.property?.title}" was confirmed.`,
    link: "/account/purchases",
  });
  await respond(res, request._id, req.user, "Payment confirmed");
};

// PATCH /api/sale-requests/:id/complete -> marks the property sold (after the office payment is confirmed)
export const completeSale = async (req, res) => {
  const request = await loadManaged(req, res);
  if (!request) return;
  if (request.paymentStatus !== "confirmed") return fail(res, 400, "Confirm the office payment before completing the sale.");

  request.status = "completed";
  addHistory(request, req.user, "Sale completed; property marked as sold");
  await note(request, req.user, "owner", "Sale completed. Congratulations on your new property!");
  await request.save();

  // The property stays listed (with its history) but is marked sold, which blocks new requests and offers
  const propertyId = request.property?._id || request.property;
  await Property.updateOne({ _id: propertyId }, { availability: "Sold" });

  // Other buyers' open requests and offers on this property are closed
  const others = await SaleRequest.find({ property: propertyId, _id: { $ne: request._id }, status: { $nin: CLOSED_SALE_STATUSES } });
  for (const other of others) {
    other.status = "cancelled";
    if (other.paymentStatus === "payment_requested") other.paymentStatus = "failed";
    addHistory(other, req.user, "Property sold to another buyer");
    await other.save();
    await notifyUser(other.customer, { type: "status", title: "Property no longer available", message: `"${request.property?.title}" has been sold.`, link: "/account/purchases" });
  }
  await Offer.updateMany({ property: propertyId, status: { $in: ["pending", "countered"] } }, { status: "rejected", response: "Property sold", respondedAt: new Date() });

  await notifyUser(request.customer._id, { type: "status", title: "Purchase completed", message: `The sale of "${request.property?.title}" is complete.`, link: "/account/purchases" });
  await respond(res, request._id, req.user, "Sale completed");
};

// PATCH /api/sale-requests/:id/cancel -> the customer withdraws their own request
export const cancelSaleRequest = async (req, res) => {
  const request = mongoose.isValidObjectId(req.params.id) ? await populate(SaleRequest.findById(req.params.id)) : null;
  if (!request || !same(request.customer, req.user)) return fail(res, 404, "Purchase request not found.");
  if (CLOSED_SALE_STATUSES.includes(request.status)) return fail(res, 400, `This purchase request is already ${LABELS[request.status]}.`);
  if (request.paymentStatus === "confirmed") return fail(res, 400, "Your payment is already confirmed. Contact the owner to make changes.");

  request.status = "cancelled";
  if (request.paymentStatus === "payment_requested") request.paymentStatus = "failed";
  addHistory(request, req.user, "Cancelled by the customer");
  await note(request, req.user, "customer", "I've cancelled my purchase request.");
  await request.save();
  await notifyOwner(request, { type: "sale", title: "Purchase request cancelled", message: `${request.contactName} cancelled their request for "${request.property?.title}".`, path: "sale-requests" });
  await respond(res, request._id, req.user, "Purchase request cancelled");
};
