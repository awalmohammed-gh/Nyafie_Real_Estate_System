import mongoose from "mongoose";
import Rental, { OCCUPYING_STATUSES } from "../models/Rental.js";
import { postSystemNote } from "./chatController.js";
import { canManageRecord, formatGHS, isOwnListing, loadPublishedProperty, ownerFilter, ownerName, same } from "../utils/ownership.js";
import { notifyOwner, notifyUser } from "../utils/notify.js";
import { cleanText, validateContact } from "../utils/validation.js";
import { ok, fail } from "../utils/response.js";
import { isHotel, quoteHotelRoom, hotelTransaction } from "../utils/hotel.js";

const DAY = 24 * 60 * 60 * 1000;
export const PAYMENT_HOLD = 30 * 60 * 1000; // a checkout in progress holds the dates for 30 minutes
const MAX_DAYS = 3 * 366;
const PROPERTY_FIELDS = "title images location price pricePeriod propertyType listingType status availability owner ownerType contact";

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
    canManage: canManageRecord(rental, user),
  };
};

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
  const property = await loadPublishedProperty(propertyId);
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

  // Dates already taken by a paid/confirmed/active rental, or held by someone else's checkout in progress
  const clash = await Rental.exists({
    property: property._id,
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
    $or: [
      { status: { $in: OCCUPYING_STATUSES } },
      { status: "payment_pending", customer: { $ne: user._id }, paymentStartedAt: { $gt: new Date(Date.now() - PAYMENT_HOLD) } },
    ],
  });
  if (clash) return { status: 409, error: "This property is already rented or booked for some of those dates. Try different dates." };

  const units = property.pricePeriod === "night" ? days : property.pricePeriod === "month" ? rentalMonths(startDate, endDate) : 1;
  const fees = 0; // no rental fees are configured on the platform
  return { property, startDate, endDate, days, units, fees, amount: units * property.price + fees };
};

// POST /api/rentals { propertyId, startDate, endDate, fullName, email, phone, currentAddress, occupants, notes }
// Saves the rental request with a server-calculated amount. Payment starts separately (/api/payments/initialize).
export const createRental = async (req, res) => {
  const contact = validateContact(req.body);
  if (contact.error) return fail(res, 400, contact.error);

  const quote = await quoteRental(req.body, req.user);
  if (quote.error) return fail(res, quote.status, quote.error);
  const { property, startDate, endDate, units, fees, amount } = quote;
  if (quote.room) return createHotelRental(req, res, quote, contact);
  const addressProblem = validateContact(req.body, { requireAddress: true });
  if (addressProblem.error) return fail(res, 400, addressProblem.error);

  const fields = {
    owner: property.owner, // from the database, never the request
    assignedTo: property.assignedTo || null, // the agency staff member handling the listing
    ownerType: property.ownerType,
    startDate,
    endDate,
    pricePeriod: property.pricePeriod,
    unitPrice: property.price,
    units,
    fees,
    amount,
    ...contact,
    occupants: Math.min(50, Math.max(1, Math.round(Number(req.body.occupants) || 1))),
    notes: cleanText(req.body.notes),
  };

  // Editing the request before paying updates the same unpaid rental instead of piling up requests
  let rental = await Rental.findOne({ customer: req.user._id, property: property._id, status: { $in: ["pending", "payment_pending"] }, paymentStatus: { $ne: "paid" } });
  const isNew = !rental;
  if (rental) {
    rental.set({ ...fields, status: "pending" });
    addHistory(rental, req.user, "Rental details updated");
  } else {
    rental = new Rental({ customer: req.user._id, property: property._id, ...fields });
    addHistory(rental, req.user, "Rental request submitted");
  }
  await rental.save();

  if (isNew) {
    await Promise.all([
      notifyUser(req.user._id, { type: "rental", title: "Rental request submitted", message: `Complete payment of ${formatGHS(amount)} to book "${property.title}".`, link: "/account/rentals" }),
      notifyOwner(rental, { type: "rental", title: "New rental request", message: `${fields.contactName} wants to rent "${property.title}" from ${toDay(startDate)}.`, path: "rentals" }),
    ]);
  }
  ok(res, presentRental(await populateRental(Rental.findById(rental._id)), req.user), "Rental details saved", 201);
};

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
  const allowed = TRANSITIONS[rental.status] || [];
  if (!allowed.includes(status)) return fail(res, 400, `A ${rental.status.replace("_", " ")} rental can't be changed to ${String(status || "that status").replace("_", " ")}.`);

  if (rental.hotelId) {
    await hotelTransaction(rental.hotelId, async (_hotel, session) => {
      const current = await Rental.findById(rental._id).session(session);
      if (!(TRANSITIONS[current.status] || []).includes(status)) { const error = new Error("Booking status changed. Reload and try again."); error.status = 409; throw error; }
      current.status = status;
      addHistory(current, req.user, cleanText(req.body.note, 300) || `Hotel booking ${STATUS_TEXT[status]}`);
      await current.save({ session });
    });
    await notifyUser(rental.customer._id, { type: "status", title: `Hotel booking ${status}`, message: `Your ${rental.roomName} booking was ${status}.${status === "cancelled" && rental.paymentStatus === "paid" ? " Contact the hotel about your refund." : ""}`, link: "/account/rentals" });
    return ok(res, presentRental(await populateRental(Rental.findById(rental._id)), req.user), "Hotel booking updated");
  }

  const reason = cleanText(req.body.note, 300);
  rental.status = status;
  addHistory(rental, req.user, reason || `Rental ${STATUS_TEXT[status]}`);
  if (rental.property?._id) {
    const conversation = await postSystemNote(rental.property, rental.customer._id, req.user, "owner", `Rental ${STATUS_TEXT[status]}.${reason ? `\n\n${reason}` : ""}`);
    rental.conversation = conversation._id;
  }
  await rental.save();

  const refund = status === "cancelled" && rental.paymentStatus === "paid" ? " The owner will contact you about your refund." : "";
  await notifyUser(rental.customer._id, {
    type: "status",
    title: `Rental ${STATUS_TEXT[status]}`,
    message: `Your rental of "${rental.property?.title || "the property"}" was ${STATUS_TEXT[status]}.${refund}`,
    link: "/account/rentals",
  });
  ok(res, presentRental(await populateRental(Rental.findById(rental._id)), req.user), "Rental updated");
};
