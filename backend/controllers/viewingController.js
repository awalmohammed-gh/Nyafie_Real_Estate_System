import { ownerPage } from "../utils/ownerPage.js";
import mongoose from "mongoose";
import Viewing, { OPEN_VIEWING_STATUSES, openKeyFor } from "../models/Viewing.js";
import { postSystemNote } from "./chatController.js";
import { canManageRecord, isOwnListing, loadPublishedProperty, ownerFilter, ownerName, populateRequest as populate, same } from "../utils/ownership.js";
import { takesStayBookings } from "../utils/hotelPayout.js";
import { notifyOwner, notifyUser } from "../utils/notify.js";
import { openRequestLimitProblem } from "../utils/openRequestLimits.js";
import { formatViewingTime, parseViewingTime, releasePastViewings } from "../utils/viewings.js";
import { ok, fail, HttpError } from "../utils/response.js";

const ENDED = { declined: "declined", cancelled: "cancelled", completed: "completed", missed: "missed" };

// Who is waiting for an answer: the side that did not propose the current time
const awaiting = (viewing) => (viewing.status === "requested" ? (viewing.proposedBy === "customer" ? "owner" : "customer") : null);

// Shapes a viewing for the viewer: the customer's contact details are only shown to the owner side
const present = (viewing, user) => {
  const v = viewing.toJSON();
  const customer = viewing.customer;
  const managing = canManageRecord(viewing, user);
  delete v.openKey;
  delete v.reminderSentAt;
  if (!managing) {
    delete v.contactPhone;
    delete v.history;
  }
  return {
    ...v,
    customer: customer?._id ? { id: String(customer._id), name: `${customer.firstName} ${customer.lastName}`, ...(managing ? { email: customer.email, phone: customer.phone } : {}) } : { id: String(customer) },
    owner: { id: viewing.ownerType === "admin" ? "admin" : String(viewing.owner?._id || viewing.owner), name: ownerName(viewing), type: viewing.ownerType },
    awaiting: awaiting(viewing),
    conversation: viewing.conversation ? String(viewing.conversation) : null,
  };
};

const loadAuthorized = async (req) => {
  const viewing = mongoose.isValidObjectId(req.params.id) ? await populate(Viewing.findById(req.params.id)) : null;
  if (!viewing || !(same(viewing.customer, req.user) || canManageRecord(viewing, req.user))) throw new HttpError(404, "Viewing not found.");
  return viewing;
};

// Posts a note into the customer/owner conversation (the viewing keeps a link to it)
const noteInChat = async (viewing, user, side, text) => {
  if (!viewing.property?._id) return null;
  try {
    const conversation = await postSystemNote(viewing.property, viewing.customer._id || viewing.customer, user, side, text);
    return conversation._id;
  } catch (error) {
    console.error("Viewing chat note failed:", error.message); // the viewing itself is already saved
    return null;
  }
};

/**
 * POST /api/viewings { propertyId, date, time, phone, message }
 * A signed-in customer asks to see a property that is for sale or for long-term rent.
 * Hotels and nightly stays are booked directly instead.
 */
export const createViewing = async (req, res) => {
  const property = await loadPublishedProperty(req.body.propertyId);
  if (!property) return fail(res, 404, "This property is not available.");
  if (takesStayBookings(property)) return fail(res, 400, "Stays are booked directly. Choose your dates and room instead.");
  if (["Sold", "Rented"].includes(property.availability)) return fail(res, 400, "This property is no longer available.");
  if (isOwnListing(property, req.user)) return fail(res, 400, "This is your own listing.");

  const now = new Date();
  const scheduledAt = parseViewingTime(req.body, now);
  const phone = String(req.body.phone ?? req.user.phone ?? "").trim();
  if (!/^\+?[\d\s()-]{7,20}$/.test(phone)) return fail(res, 400, "Enter a phone number the owner can call you on.");
  const message = String(req.body.message || "").trim().slice(0, 1000);

  // Past viewings no longer block a new one; then at most one open viewing per listing
  await releasePastViewings(now, { customer: req.user._id, property: property._id });
  const tooMany = await openRequestLimitProblem("viewings", req.user._id, property._id);
  if (tooMany) return fail(res, 429, tooMany);

  const when = formatViewingTime(scheduledAt);
  // One transaction: the viewing, its chat note and the link between them are saved together
  let viewing;
  try {
    viewing = await mongoose.connection.transaction(async (session) => {
      const conversation = await postSystemNote(property, req.user._id, req.user, "customer", [`Viewing requested for ${when}.`, message].filter(Boolean).join("\n\n"), session);
      const created = new Viewing({
        customer: req.user._id,
        property: property._id,
        owner: property.owner, // the real owner, from the database
        assignedTo: property.assignedTo || null,
        ownerType: property.ownerType,
        scheduledAt,
        proposedBy: "customer",
        contactName: `${req.user.firstName} ${req.user.lastName}`.trim(),
        contactPhone: phone,
        message,
        openKey: openKeyFor(req.user._id, property._id),
        conversation: conversation._id,
        history: [{ status: "requested", note: `Requested for ${when}`, by: req.user._id }],
      });
      await created.save({ session });
      return created;
    });
  } catch (error) {
    if (error.code === 11000) return fail(res, 409, "You already have a viewing booked for this property. Change or cancel it in My viewings.");
    throw error;
  }
  await Promise.all([
    notifyOwner(viewing, { type: "viewing", title: "New viewing request", message: `${req.user.firstName} would like to view "${property.title}" on ${when}.`, path: "viewings" }),
    notifyUser(req.user._id, { type: "viewing", title: "Viewing requested", message: `Your request to view "${property.title}" on ${when} was sent. You'll be notified when the owner answers.`, link: "/account/viewings" }),
  ]);
  ok(res, present(await populate(Viewing.findById(viewing._id)), req.user), "Viewing requested", 201);
};

// GET /api/viewings/my -> the signed-in customer's viewings, soonest first
export const myViewings = async (req, res) => {
  const viewings = await populate(Viewing.find({ customer: req.user._id }).sort({ scheduledAt: -1 }).limit(200));
  ok(res, viewings.map((v) => present(v, req.user)));
};

// GET /api/agents/viewings and /api/admin/viewings -> viewings on the owner's listings (admins: all)
export const ownerViewings = async (req, res) => {
  const now = new Date();
  const toAnswer = { status: "requested", proposedBy: "customer" };
  const toMark = { status: "confirmed", scheduledAt: { $lte: now } }; // its time has passed: did it take place?
  const action = { $or: [toAnswer, toMark] };
  const upcoming = { $and: [{ status: { $in: OPEN_VIEWING_STATUSES }, scheduledAt: { $gt: now } }, { $nor: [toAnswer, toMark] }] };
  ok(res, await ownerPage(req, {
    Model: Viewing, fields: ["contactName", "message"],
    tab: (counts) => (counts.action ? "action" : "upcoming"),
    tabs: { action, upcoming, past: { $nor: [action, upcoming] } },
    stats: { action, upcoming, week: { status: "confirmed", scheduledAt: { $gt: now, $lt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) } }, completed: { status: "completed" } },
    sort: (tab) => (tab === "past" ? { scheduledAt: -1, _id: -1 } : { scheduledAt: 1, _id: 1 }),
    load: async (query) => (await populate(query)).map((v) => present(v, req.user)),
  }));
};

// GET /api/viewings/:id
export const getViewing = async (req, res) => {
  ok(res, present(await loadAuthorized(req), req.user));
};

/**
 * PATCH /api/viewings/:id { action, date, time, message }
 *  owner side:    confirm | propose | decline | cancel | complete | missed
 *  customer side: accept | propose | cancel
 * Proposing a new time hands the decision to the other side. Every change is applied only if the
 * viewing is still as the person saw it, so two people answering at once can't both succeed.
 */
export const updateViewing = async (req, res) => {
  const viewing = await loadAuthorized(req);
  const side = canManageRecord(viewing, req.user) && !same(viewing.customer, req.user) ? "owner" : "customer";
  const { action } = req.body;
  const note = String(req.body.message || "").trim().slice(0, 1000);
  const now = new Date();
  const open = OPEN_VIEWING_STATUSES.includes(viewing.status);
  const waitingOnMe = awaiting(viewing) === side;
  const past = viewing.scheduledAt <= now;
  const title = viewing.property?.title || "the property";
  const when = formatViewingTime(viewing.scheduledAt);

  let changes;
  let text;
  let unsetOpenKey = false;
  if ((action === "confirm" && side === "owner") || (action === "accept" && side === "customer")) {
    if (viewing.status !== "requested" || !waitingOnMe) return fail(res, 400, "There's no time waiting for your answer.");
    if (past) return fail(res, 400, "This time has passed. Suggest a new time instead.");
    changes = { status: "confirmed" };
    text = `Viewing confirmed for ${when}.`;
  } else if (action === "propose") {
    if (!open) return fail(res, 400, `This viewing is already ${viewing.status}.`);
    const scheduledAt = parseViewingTime(req.body, now);
    changes = { status: "requested", proposedBy: side, scheduledAt, reminderSentAt: null };
    text = `New time suggested: ${formatViewingTime(scheduledAt)}${viewing.status === "confirmed" ? ` (instead of ${when})` : ""}.`;
  } else if (action === "decline" && side === "owner") {
    if (viewing.status !== "requested" || !waitingOnMe) return fail(res, 400, "Only a request waiting for your answer can be declined.");
    changes = { status: "declined" };
    unsetOpenKey = true;
    text = `Viewing request for ${when} declined.`;
  } else if (action === "cancel") {
    if (!open) return fail(res, 400, `This viewing is already ${viewing.status}.`);
    changes = { status: "cancelled", cancelledBy: side };
    unsetOpenKey = true;
    text = `Viewing for ${when} cancelled by the ${side === "owner" ? "owner" : "customer"}.`;
  } else if ((action === "complete" || action === "missed") && side === "owner") {
    if (viewing.status !== "confirmed") return fail(res, 400, "Only a confirmed viewing can be marked.");
    if (!past) return fail(res, 400, "You can mark the viewing once its time has started.");
    changes = { status: action === "complete" ? "completed" : "missed" };
    unsetOpenKey = true;
    text = action === "complete" ? `Viewing on ${when} marked as completed.` : `Viewing on ${when} marked as missed.`;
  } else {
    return fail(res, 400, "This action isn't available for this viewing.");
  }
  if (note) changes.response = note;

  const updated = await Viewing.findOneAndUpdate(
    { _id: viewing._id, status: viewing.status, proposedBy: viewing.proposedBy, scheduledAt: viewing.scheduledAt },
    { $set: changes, ...(unsetOpenKey ? { $unset: { openKey: "" } } : {}), $push: { history: { status: changes.status, note: [text, note].filter(Boolean).join(" – ").slice(0, 300), by: req.user._id, at: now } } },
    { returnDocument: "after" },
  );
  if (!updated) return fail(res, 409, "This viewing just changed. Refresh to see the latest.");

  const conversation = await noteInChat(viewing, req.user, side, [text, note].filter(Boolean).join("\n\n"));
  if (conversation && !viewing.conversation) await Viewing.updateOne({ _id: viewing._id }, { $set: { conversation } });
  const titles = { confirmed: "Viewing confirmed", requested: "New viewing time suggested", declined: "Viewing request declined", cancelled: "Viewing cancelled", completed: "Viewing completed", missed: "Viewing marked as missed" };
  const message = `${text} (${title})`;
  if (side === "owner") {
    if (!["completed"].includes(changes.status)) await notifyUser(viewing.customer._id || viewing.customer, { type: "viewing", title: titles[changes.status], message, link: "/account/viewings" });
  } else {
    await notifyOwner(viewing, { type: "viewing", title: changes.status === "confirmed" ? "Viewing time accepted" : titles[changes.status], message: `${viewing.contactName}: ${message}`, path: "viewings" });
  }
  const labels = { confirmed: "Viewing confirmed", requested: "New time suggested", ...Object.fromEntries(Object.entries(ENDED).map(([key, word]) => [key, `Viewing ${word}`])) };
  ok(res, present(await populate(Viewing.findById(viewing._id)), req.user), labels[changes.status]);
};
