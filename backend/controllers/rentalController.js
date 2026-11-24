import mongoose from "mongoose";
import Rental from "../models/Rental.js";
import { postSystemNote } from "./chatController.js";
import { canManageRecord, formatGHS, isOwnListing, loadPublishedProperty, ownerFilter, ownerName, REQUEST_PROPERTY_FIELDS, same } from "../utils/ownership.js";
import { notifyOwner, notifyUser } from "../utils/notify.js";
import { cleanText, validateContact } from "../utils/validation.js";
import { HttpError, ok, fail } from "../utils/response.js";
import { isHotel, quoteHotelRoom, hotelTransaction } from "../utils/hotel.js";
import { hasRentalConflict, rentalInventoryTransaction } from "../utils/rentalAvailability.js";
import { announceCancelledBookingRefund, flagCancelledBookingPayment } from "../utils/refunds.js";
import { openRequestLimitProblem } from "../utils/openRequestLimits.js";
import Payment from "../models/Payment.js";
import { newReference } from "../utils/paystack.js";
import { OFFICE_METHOD, paysAtOffice } from "../utils/officePayments.js";
import { buildReceipt, deliverReceipt, presentReceipt } from "../utils/receipts.js";

// What the customer is told about their money when a paid booking is cancelled
const refundNotice = (flagged, cancelledPaid, fallback) => {
  if (flagged) return ` Your payment of ${formatGHS(flagged.amount)} will be refunded; we will let you know when it is processed.`;
  return cancelledPaid ? fallback : "";
};
export { PAYMENT_HOLD } from "../utils/rentalAvailability.js";

const DAY = 24 * 60 * 60 * 1000;
const MAX_DAYS = 3 * 366;
const PROPERTY_FIELDS = `${REQUEST_PROPERTY_FIELDS} propertyType`;

// What the owner side may move a rental to, from each status
const TRANSITIONS = {
  pending: ["cancelled"],
  payment_pending: ["cancelled"],
  paid: ["confirmed", "cancelled"],
  confirmed: ["active", "cancelled"],
  active: ["completed"],
};
const STATUS_TEXT = { confirmed: "confirmed", active: "marked active (moved in)", completed: "completed", cancelled: "cancelled" };

export const populateRental = (query) =>
  query
    .populate("property", PROPERTY_FIELDS)
    .populate("customer", "firstName lastName email phone")
    .populate("owner", "firstName lastName")
    .populate("history.by", "firstName lastName role");

const presentHistory = (history = []) =>
  history.map((h) => ({
    status: h.status,
    paymentStatus: h.paymentStatus,
    note: h.note,
    at: h.at,
    by: h.by?._id ? { name: `${h.by.firstName} ${h.by.lastName}`, role: h.by.role } : null,
  }));

export const presentRental = (rental, user) => {
  const r = rental.toJSON();
  const customer = rental.customer;
  return {
    ...r,
    ...(rental.hotelId ? { customerId: String(customer?._id || customer) } : {}),
    customer: customer?._id ? { id: String(customer._id), name: `${customer.firstName} ${customer.lastName}` } : { id: String(customer) },
    owner: { id: rental.ownerType === "admin" ? "admin" : String(rental.owner?._id || rental.owner), name: ownerName(rental), type: rental.ownerType },
    conversation: rental.conversation ? String(rental.conversation) : null,
    history: presentHistory(rental.history),
    receipt: presentReceipt(rental.receipt),
    // Monthly and fixed-price rentals are paid at the office (utils/officePayments.js)
    paysAtOffice: rental.paymentOption === "office" || (!rental.hotelId && rental.pricePeriod !== "night" && rental.paymentStatus !== "paid" && ["pending", "confirmed"].includes(rental.status)),
    canManage: canManageRecord(rental, user),
  };
};

// The owner side has to give the guest a receipt for a hotel booking paid online (into the hotel's own
// account) before the stay starts; payments recorded at the hotel get theirs when they are recorded
const needsReceipt = (rental) => Boolean(rental.hotelId) && rental.paymentStatus === "paid" && !rental.receipt?.number;

export const addHistory = (doc, user, note = "") => doc.history.push({ status: doc.status, paymentStatus: doc.paymentStatus, note, by: user?._id });

// "2026-01-31" -> Date at midnight UTC, or null
const parseDay = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

// Charge whole calendar months, rounding only a partial final month up.
// A year selected in checkout costs 12 months rather than ceil(365 / 30) = 13.
export const rentalMonths = (start, end) => {
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  const anniversary = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(anniversary.getUTCFullYear(), anniversary.getUTCMonth() + 1, 0)).getUTCDate();
  anniversary.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return Math.max(1, months + (anniversary < end ? 1 : 0));
};

export const toDay = (date) => new Date(date).toISOString().slice(0, 10);

const todayUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

/**
 * Checks a rental request and calculates the price. Every value comes from the
 * database; the request only supplies the property id and the dates.
 * Returns { property, startDate, endDate, units, amount } or { status, error }.
 */
export const quoteRental = async (body, user, options = {}) => {
  const { propertyId, startDate: start, endDate: end } = body;
  const property = await loadPublishedProperty(propertyId, options);
  if (!property) return { status: 404, error: "This property is not available." };
  if (property.listingType !== "Rent") return { status: 400, error: "This property is for sale. Contact the listing agent or make an offer instead." };
  if (property.currency !== "GHS") return { status: 400, error: "Online rental payments support GHS only. Contact the agent to arrange this rental." };
  if (property.availability !== "Available") return { status: 400, error: "This property is not available for rent right now." };
  if (isOwnListing(property, user)) return { status: 400, error: "This is your own listing." };
  if (isHotel(property)) {
    try { return await quoteHotelRoom(property, body, options); }
    catch (error) { if (error.status) return { status: error.status, error: error.message }; throw error; }
  }

  const startDate = parseDay(start);
  const endDate = parseDay(end);
  if (!startDate || !endDate) return { status: 400, error: "Choose a move-in date and rental period." };
  if (startDate < todayUTC()) return { status: 400, error: "The move-in date can't be in the past." };
  const days = Math.round((endDate - startDate) / DAY);
  if (days < 1) return { status: 400, error: "The end date must be after the move-in date." };
  if (days > MAX_DAYS) return { status: 400, error: "Rentals can be booked for up to 3 years at a time." };

  const clash = await hasRentalConflict({ property: property._id, startDate, endDate }, options);
  if (clash) return { status: 409, error: "This property is already rented or booked for some of those dates. Try different dates." };

  const units = property.pricePeriod === "night" ? days : property.pricePeriod === "month" ? rentalMonths(startDate, endDate) : 1;
  const fees = 0; // no rental fees are configured on the platform
  return { property, startDate, endDate, days, units, fees, amount: units * property.price + fees };
};

// POST /api/rentals { propertyId, startDate, endDate, fullName, email, phone, currentAddress, occupants, notes }
// Saves the rental request with a server-calculated amount. Payment starts separately (/api/payments/initialize).
export const createRental = async (req, res) => {
  const contact = validateContact({ ...req.body, email: req.user.email });
  if (contact.error) return fail(res, 400, contact.error);

  // Request previews may revisit the customer's own checkout. Only the serialized
  // checkout below grants a hold, and it excludes just that booking's ID.
  const quote = await quoteRental(req.body, req.user, { ignoreHoldCustomer: req.user._id });
  if (quote.error) return fail(res, quote.status, quote.error);
  const { property } = quote;
  const tooMany = await openRequestLimitProblem("rentals", req.user._id, property._id);
  if (tooMany) return fail(res, 429, tooMany);
  if (quote.room) return createHotelRental(req, res, quote, contact);
  const addressProblem = validateContact({ ...req.body, email: req.user.email }, { requireAddress: true });
  if (addressProblem.error) return fail(res, 400, addressProblem.error);

  const { rental, isNew } = await saveRegularRentalRequest(req, property, contact);

  if (isNew) {
    const office = paysAtOffice(property);
    await Promise.all([
      notifyUser(req.user._id, { type: "rental", title: "Rental request submitted", message: office
        ? `The owner will confirm "${property.title}". Then pay ${formatGHS(rental.amount)} at their office and get a receipt. Never pay online or to a personal number.`
        : `Complete payment of ${formatGHS(rental.amount)} to book "${property.title}".`, link: "/account/rentals" }),
      notifyOwner(rental, { type: "rental", title: "New rental request", message: `${rental.contactName} wants to rent "${property.title}" from ${toDay(rental.startDate)}.`, path: "rentals" }),
    ]);
  }
  ok(res, presentRental(await populateRental(Rental.findById(rental._id)), req.user), "Rental details saved", 201);
};

const saveRegularRentalRequest = (req, initial, contact) => rentalInventoryTransaction(initial._id, async (property, session) => {
  const quote = await quoteRental(req.body, req.user, { session, ignoreHoldCustomer: req.user._id });
  if (quote.error) throw new HttpError(quote.status, quote.error);
  const fields = {
    owner: property.owner, assignedTo: property.assignedTo || null, ownerType: property.ownerType,
    startDate: quote.startDate, endDate: quote.endDate, pricePeriod: property.pricePeriod,
    unitPrice: property.price, units: quote.units, fees: quote.fees, amount: quote.amount,
    ...contact, occupants: Math.min(50, Math.max(1, Math.round(Number(req.body.occupants) || 1))), notes: cleanText(req.body.notes),
  };
  let rental = await Rental.findOne({ customer: req.user._id, property: property._id, status: { $in: ["pending", "payment_pending"] }, paymentStatus: { $ne: "paid" } }).sort({ createdAt: -1 }).session(session);
  // Once a checkout exists, an earlier charge must keep referring to its original
  // dates and price. Different terms create a new request instead of rewriting it.
  if (rental?.paymentReference) {
    const sameTerms = rental.startDate.getTime() === fields.startDate.getTime() && rental.endDate.getTime() === fields.endDate.getTime() && rental.amount === fields.amount;
    if (sameTerms) return { rental, isNew: false };
    rental = null;
  }
  const isNew = !rental;
  if (rental) rental.set({ ...fields, status: "pending" });
  else rental = new Rental({ customer: req.user._id, property: property._id, ...fields });
  addHistory(rental, req.user, isNew ? "Rental request submitted" : "Rental details updated");
  await rental.save({ session });
  return { rental, isNew };
});

const createHotelRental = async (req, res, quote, contact) => {
  const { property, room } = quote;
  const rental = await hotelTransaction(property._id, async (hotel, session) => {
    const verified = await quoteHotelRoom(hotel, req.body, { session });
    // Editing dates/rooms after opening checkout is forbidden. Each request has a
    // separate immutable ID so an older successful charge cannot pay for new dates.
    const doc = new Rental({
      customer: req.user._id, property: hotel._id, hotelId: hotel._id,
      owner: hotel.owner, ownerType: hotel.ownerType, assignedTo: hotel.assignedTo || null,
      roomTypeId: verified.room._id, roomName: verified.room.name,
      startDate: verified.startDate, endDate: verified.endDate,
      pricePeriod: "night", unitPrice: verified.room.pricePerNight, units: verified.units,
      numberOfRooms: verified.numberOfRooms, occupants: verified.guests,
      amount: verified.amount, fees: 0, ...contact, notes: cleanText(req.body.notes),
    });
    addHistory(doc, req.user, `Hotel booking requested: ${verified.room.name}`);
    await doc.save({ session });
    return doc;
  });
  await notifyOwner(rental, { type: "rental", title: "New hotel booking request", message: `${contact.contactName} requested ${rental.numberOfRooms} ${room.name} room(s) at "${property.title}".`, path: "rentals" });
  return ok(res, presentRental(await populateRental(Rental.findById(rental._id)), req.user), "Hotel booking details saved", 201);
};

// GET /api/rentals/my
export const myRentals = async (req, res) => {
  const rentals = await populateRental(Rental.find({ customer: req.user._id }).sort({ createdAt: -1 }));
  ok(res, rentals.map((r) => presentRental(r, req.user)));
};

// GET /api/agents/rentals and /api/admin/rentals (admins see all)
export const ownerRentals = async (req, res) => {
  const rentals = await populateRental(Rental.find(ownerFilter(req.user)).sort({ createdAt: -1 }));
  ok(res, rentals.map((r) => presentRental(r, req.user)));
};

// GET /api/rentals/:id
export const getRental = async (req, res) => {
  const rental = mongoose.isValidObjectId(req.params.id) ? await populateRental(Rental.findById(req.params.id)) : null;
  if (!rental || !(same(rental.customer, req.user) || canManageRecord(rental, req.user))) return fail(res, 404, "Rental not found.");
  ok(res, presentRental(rental, req.user));
};

// PATCH /api/rentals/:id/status { status, note } -> owner side only, following the rental lifecycle
export const updateRentalStatus = async (req, res) => {
  const rental = mongoose.isValidObjectId(req.params.id) ? await populateRental(Rental.findById(req.params.id)) : null;
  if (!rental || !canManageRecord(rental, req.user)) return fail(res, 404, "Rental not found.");
  const { status } = req.body;
  // Regular rentals check their transitions below (office rentals have one more)
  if (rental.hotelId && !(TRANSITIONS[rental.status] || []).includes(status)) return fail(res, 400, `A ${rental.status.replace("_", " ")} rental can't be changed to ${String(status || "that status").replace("_", " ")}.`);

  // A paid booking that is cancelled flags its Paystack charge for a refund in the same transaction
  let flagged = null;
  if (rental.hotelId) {
    await hotelTransaction(rental.hotelId, async (_hotel, session) => {
      const current = await Rental.findById(rental._id).session(session);
      if (!(TRANSITIONS[current.status] || []).includes(status)) { const error = new Error("Booking status changed. Reload and try again."); error.status = 409; throw error; }
      if (status === "completed" && current.paymentStatus === "due") throw new HttpError(409, "Record the guest's payment at the hotel before completing this stay.");
      if (["active", "completed"].includes(status) && needsReceipt(current)) throw new HttpError(409, "Send the guest their receipt for the online payment first.");
      current.status = status;
      addHistory(current, req.user, cleanText(req.body.note, 300) || `Hotel booking ${STATUS_TEXT[status]}`);
      await current.save({ session });
      flagged = status === "cancelled" && current.paymentStatus === "paid" ? await flagCancelledBookingPayment(current, session) : null;
    });
    if (flagged) await announceCancelledBookingRefund(flagged);
    await notifyUser(rental.customer._id, { type: "status", title: `Hotel booking ${status}`, message: `Your ${rental.roomName} booking was ${status}.${refundNotice(flagged, status === "cancelled" && rental.paymentStatus === "paid", " Contact the hotel about your refund.")}`, link: "/account/rentals" });
    return ok(res, presentRental(await populateRental(Rental.findById(rental._id)), req.user), "Hotel booking updated");
  }

  const reason = cleanText(req.body.note, 300);
  // Monthly and fixed-price rentals: the owner confirms the request (the dates are then taken), the
  // tenant pays at the office, and only a recorded payment lets them move in
  const office = (current) => current.paymentOption === "office" || (current.status === "pending" && current.paymentStatus !== "paid" && paysAtOffice(rental.property));
  const allowedFor = (current) => office(current) && current.status === "pending" ? ["confirmed", "cancelled"] : TRANSITIONS[current.status] || [];
  if (!allowedFor(rental).includes(status)) return fail(res, 400, `A ${rental.status.replace("_", " ")} rental can't be changed to ${String(status || "that status").replace("_", " ")}.`);
  const updated = await rentalInventoryTransaction(rental.property?._id || rental.property, async (_property, session) => {
    const current = await Rental.findById(rental._id).session(session);
    if (!current || !allowedFor(current).includes(status)) throw new HttpError(409, "Rental status changed. Reload and try again.");
    if (status === "completed" && current.paymentStatus === "due") throw new HttpError(409, current.paymentOption === "office" ? "Record the tenant's office payment before completing this rental." : "Record the guest's payment on arrival before completing this stay.");
    if (status === "active" && current.paymentOption === "office" && current.paymentStatus !== "paid") throw new HttpError(409, "Record the tenant's payment at the office before they move in.");
    if (status === "confirmed" && current.status === "pending") {
      // Confirming takes the dates: nobody else may hold or have them
      if (await hasRentalConflict(current, { session })) throw new HttpError(409, "Those dates are already rented or being paid for. Agree new dates with the tenant.");
      current.set({ paymentOption: "office", paymentStatus: "due", paymentMethod: OFFICE_METHOD });
    }
    current.status = status;
    addHistory(current, req.user, reason || (current.paymentOption === "office" && status === "confirmed" ? "Rental confirmed: payment due at the office" : `Rental ${STATUS_TEXT[status]}`));
    await current.save({ session });
    flagged = status === "cancelled" && current.paymentStatus === "paid" ? await flagCancelledBookingPayment(current, session) : null;
    return current;
  });
  if (flagged) await announceCancelledBookingRefund(flagged);
  const officeDue = updated.paymentOption === "office" && status === "confirmed";
  const officeText = officeDue ? ` Pay ${formatGHS(updated.amount)} at ${ownerName(rental)}'s office and get a receipt. Never pay online or to a personal number.` : "";
  if (rental.property?._id) {
    const conversation = await postSystemNote(rental.property, rental.customer._id, req.user, "owner", `Rental ${STATUS_TEXT[status]}.${officeText}${reason ? `\n\n${reason}` : ""}`);
    await Rental.updateOne({ _id: updated._id }, { $set: { conversation: conversation._id } });
  }

  const refund = refundNotice(flagged, status === "cancelled" && updated.paymentStatus === "paid", " The owner will contact you about your refund.");
  await notifyUser(rental.customer._id, {
    type: "status",
    title: `Rental ${STATUS_TEXT[status]}`,
    message: `Your rental of "${rental.property?.title || "the property"}" was ${STATUS_TEXT[status]}.${officeText}${refund}`,
    link: "/account/rentals",
  });
  ok(res, presentRental(await populateRental(Rental.findById(rental._id)), req.user), "Rental updated");
};

// Hotel bookings serialize on the hotel; other rentals on their property's inventory
export const bookingTransaction = (rental, work) => rental.hotelId ? hotelTransaction(rental.hotelId, work) : rentalInventoryTransaction(rental.property, work);
// How a booking is named in messages: "Deluxe stay" / "stay at "Sea View Flat""
const stayName = (rental) => rental.hotelId ? `${rental.roomName} stay` : `stay at "${rental.property?.title || "the property"}"`;

// What a rental's receipt says it paid for
const receiptDescription = (rental) => rental.hotelId
  ? `${rental.numberOfRooms} × ${rental.roomName}, ${toDay(rental.startDate)} to ${toDay(rental.endDate)} at "${rental.property?.title || "the hotel"}"`
  : `Rent for "${rental.property?.title || "the property"}", ${toDay(rental.startDate)} to ${toDay(rental.endDate)}`;

/**
 * PATCH /api/rentals/:id/paid-on-arrival and /paid-at-office { note, reference } -> owner side: the
 * guest paid on arrival (hotels, short stays) or the tenant paid at the office (monthly and fixed-price
 * rentals). The receipt is issued with it, in the same transaction, and sent to the customer.
 */
export const recordArrivalPayment = async (req, res) => {
  const rental = mongoose.isValidObjectId(req.params.id) ? await populateRental(Rental.findById(req.params.id)) : null;
  if (!rental || !canManageRecord(rental, req.user)) return fail(res, 404, "Booking not found.");
  const office = rental.paymentOption === "office";
  const where = office ? "at the office" : rental.hotelId ? "at the hotel" : "on arrival";
  const note = cleanText(req.body?.note, 300);
  const reference = cleanText(req.body?.reference, 80);
  const updated = await bookingTransaction({ hotelId: rental.hotelId, property: rental.property?._id || rental.property }, async (_listing, session) => {
    const current = await Rental.findById(rental._id).session(session);
    if (!["on_arrival", "office"].includes(current.paymentOption) || current.paymentStatus !== "due" || !["confirmed", "active"].includes(current.status)) throw new HttpError(409, `Only a booking with payment due ${where} can be marked as paid.`);
    const now = new Date();
    const method = office ? OFFICE_METHOD : current.hotelId ? "At hotel" : "On arrival";
    // Office rent goes in the payment ledger like sales do (never reconciled with Paystack)
    let ledgerReference = reference;
    if (office) {
      const [payment] = await Payment.create([{ kind: "rental", rental: current._id, customer: current.customer, property: current.property, owner: current.owner, ownerType: current.ownerType, amount: current.amount, method: "Office", reference: newReference("HBO"), status: "paid", paidAt: now, confirmedBy: req.user._id, note }], { session });
      ledgerReference = reference || payment.reference;
    }
    current.set({ paymentStatus: "paid", paymentMethod: method, paidAt: now });
    current.receipt = await buildReceipt({ ...current.toObject(), property: rental.property }, {
      amount: current.amount, method: office ? OFFICE_METHOD : current.hotelId ? "At the hotel" : "On arrival", paymentReference: ledgerReference, note,
      description: receiptDescription({ ...current.toObject(), property: rental.property }), issuer: req.user, now, session,
    });
    addHistory(current, req.user, note || `Payment received ${where}; receipt ${current.receipt.number} sent`);
    await current.save({ session });
    return current;
  });
  await deliverReceipt({ customer: rental.customer._id, email: updated.contactEmail, receipt: updated.receipt, link: "/account/rentals" });
  ok(res, presentRental(await populateRental(Rental.findById(rental._id)), req.user), "Payment recorded and receipt sent");
};

// POST /api/rentals/:id/receipt { note } -> owner side: the receipt for a hotel booking the guest paid
// online into the hotel's account. Needed before the stay starts; issued once.
export const sendRentalReceipt = async (req, res) => {
  const rental = mongoose.isValidObjectId(req.params.id) ? await populateRental(Rental.findById(req.params.id)) : null;
  if (!rental || !canManageRecord(rental, req.user)) return fail(res, 404, "Booking not found.");
  const note = cleanText(req.body?.note, 300);
  const updated = await bookingTransaction({ hotelId: rental.hotelId, property: rental.property?._id || rental.property }, async (_listing, session) => {
    const current = await Rental.findById(rental._id).session(session);
    if (current.receipt?.number) throw new HttpError(409, `Receipt ${current.receipt.number} was already sent.`);
    if (current.paymentStatus !== "paid" || current.paymentMethod !== "Paystack" || current.status === "cancelled") throw new HttpError(409, "Only a booking paid online can get a receipt here. Record payments at the hotel instead.");
    current.receipt = await buildReceipt({ ...current.toObject(), property: rental.property }, {
      amount: current.amount, method: "Online (Paystack)", paymentReference: current.paymentReference, note,
      description: receiptDescription({ ...current.toObject(), property: rental.property }), issuer: req.user, session,
    });
    addHistory(current, req.user, `Receipt ${current.receipt.number} sent to the guest`);
    await current.save({ session });
    return current;
  });
  await deliverReceipt({ customer: rental.customer._id, email: updated.contactEmail, receipt: updated.receipt, link: "/account/rentals" });
  ok(res, presentRental(await populateRental(Rental.findById(rental._id)), req.user), "Receipt sent");
};

// PATCH /api/rentals/:id/cancel -> the guest cancels an unpaid hotel request, or a pay-on-arrival
// reservation before its check-in day. Paid bookings go through the owner (refunds need review).
export const cancelMyReservation = async (req, res) => {
  const rental = mongoose.isValidObjectId(req.params.id) ? await populateRental(Rental.findOne({ _id: req.params.id, customer: req.user._id })) : null;
  if (!rental) return fail(res, 404, "Booking not found.");
  const contact = rental.hotelId ? "Contact the hotel." : "Chat with the owner.";
  const updated = await bookingTransaction({ hotelId: rental.hotelId, property: rental.property?._id || rental.property }, async (_listing, session) => {
    const current = await Rental.findById(rental._id).session(session);
    const request = (Boolean(current.hotelId) || paysAtOffice(rental.property)) && current.status === "pending" && current.paymentStatus !== "paid";
    const reservation = ["on_arrival", "office"].includes(current.paymentOption) && current.status === "confirmed" && current.paymentStatus === "due" && todayUTC() < current.startDate;
    if (!request && !reservation) throw new HttpError(409, `This booking can't be cancelled online. ${contact}`);
    current.status = "cancelled";
    addHistory(current, req.user, reservation ? "Reservation cancelled by the guest" : "Booking request cancelled by the guest");
    await current.save({ session });
    return current;
  });
  if (["on_arrival", "office"].includes(updated.paymentOption)) {
    const freed = rental.hotelId ? "The rooms are available again." : "Those dates are available again.";
    await notifyOwner(updated, { type: "rental", title: "Reservation cancelled", message: `${updated.contactName} cancelled their ${stayName(rental)} reservation for ${toDay(updated.startDate)}. ${freed}`, path: "rentals" });
  }
  ok(res, presentRental(await populateRental(Rental.findById(rental._id)), req.user), "Booking cancelled");
};
