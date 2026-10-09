import mongoose from "mongoose";
import Offer from "../models/Offer.js";
import Property from "../models/Property.js";
import SaleRequest from "../models/SaleRequest.js";
import { postSystemNote } from "./chatController.js";
import { canManageRecord, formatGHS, isOwnListing, loadPublishedProperty, ownerFilter, ownerName, same } from "../utils/ownership.js";
import { notifyOwner, notifyUser } from "../utils/notify.js";
import { ok, fail } from "../utils/response.js";

const PROPERTY_FIELDS = "title images location price pricePeriod listingType status availability owner ownerType contact";
const OPEN = ["pending", "countered"];
const PERIOD = { month: " per month", night: " per night", total: "" };

const populate = (query) =>
  query.populate("property", PROPERTY_FIELDS).populate("customer", "firstName lastName email phone").populate("owner", "firstName lastName");

// Shapes an offer for the viewer: customer contact details are only shown to the owner side
const present = (offer, user) => {
  const o = offer.toJSON();
  const customer = offer.customer;
  const managing = canManageRecord(offer, user);
  return {
    ...o,
    customer: customer?._id
      ? { id: String(customer._id), name: `${customer.firstName} ${customer.lastName}`, ...(managing ? { email: customer.email, phone: customer.phone } : {}) }
      : { id: String(customer) },
    owner: { id: offer.ownerType === "admin" ? "admin" : String(offer.owner?._id || offer.owner), name: ownerName(offer), type: offer.ownerType },
    conversation: offer.conversation ? String(offer.conversation) : null,
  };
};

// Loads an offer the signed-in account may see (its customer, or the owner side)
const loadAuthorized = async (req, res) => {
  const offer = mongoose.isValidObjectId(req.params.id) ? await populate(Offer.findById(req.params.id)) : null;
  if (!offer || !(same(offer.customer, req.user) || canManageRecord(offer, req.user))) {
    fail(res, 404, "Offer not found.");
    return null;
  }
  return offer;
};

// Posts a note into the customer/owner conversation and remembers it on the offer
const note = async (offer, property, user, side, text) => {
  const conversation = await postSystemNote(property, offer.customer._id || offer.customer, user, side, text);
  offer.conversation = conversation._id;
};

// POST /api/offers { propertyId, amount, message } -> sale price, or proposed rent for rentals
export const createOffer = async (req, res) => {
  const amount = Math.round(Number(req.body.amount));
  if (!Number.isFinite(amount) || amount < 1) return fail(res, 400, "Enter a valid offer amount.");
  const message = String(req.body.message || "").trim().slice(0, 1000);

  const property = await loadPublishedProperty(req.body.propertyId);
  if (!property) return fail(res, 404, "This property is not available.");
  if (["Sold", "Rented"].includes(property.availability)) return fail(res, 400, "This property is no longer available.");
  if (isOwnListing(property, req.user)) return fail(res, 400, "This is your own listing.");

  const existing = await Offer.findOne({ customer: req.user._id, property: property._id, status: "pending" });
  if (existing) return fail(res, 409, "You already have a pending offer on this property. Withdraw it first to make a new one.");

  const offer = new Offer({
    customer: req.user._id,
    property: property._id,
    owner: property.owner, // the real owner, from the database
    assignedTo: property.assignedTo || null, // the agency staff member handling the listing
    ownerType: property.ownerType,
    askingPrice: property.price,
    amount,
    message,
  });

  const period = property.listingType === "Rent" ? PERIOD[property.pricePeriod] || "" : "";
  const text = [`New offer: ${formatGHS(amount)}${period} (listed at ${formatGHS(property.price)}${period}).`, message].filter(Boolean).join("\n\n");
  await note(offer, property, req.user, "customer", text);
  await offer.save();

  // A customer who already asked to buy is now negotiating on price
  await SaleRequest.updateMany(
    { customer: req.user._id, property: property._id, status: { $in: ["pending", "contacted"] } },
    { $set: { status: "offer_received" }, $push: { history: { status: "offer_received", note: `Offer of ${formatGHS(amount)} made`, by: req.user._id } } }
  );

  await Promise.all([
    notifyOwner(offer, { type: "offer", title: "New offer received", message: `${req.user.firstName} offered ${formatGHS(amount)}${period} for "${property.title}".`, path: "offers" }),
    notifyUser(req.user._id, { type: "offer", title: "Offer submitted", message: `Your offer of ${formatGHS(amount)} for "${property.title}" was sent to the owner.`, link: "/account/offers" }),
  ]);
  ok(res, present(await populate(Offer.findById(offer._id)), req.user), "Offer submitted", 201);
};

// GET /api/offers/my -> offers the signed-in customer made
export const myOffers = async (req, res) => {
  const offers = await populate(Offer.find({ customer: req.user._id }).sort({ createdAt: -1 }));
  ok(res, offers.map((o) => present(o, req.user)));
};

// GET /api/agents/offers and /api/admin/offers -> offers received (admins see all)
export const ownerOffers = async (req, res) => {
  const offers = await populate(Offer.find(ownerFilter(req.user)).sort({ createdAt: -1 }));
  ok(res, offers.map((o) => present(o, req.user)));
};

// GET /api/offers/:id
export const getOffer = async (req, res) => {
  const offer = await loadAuthorized(req, res);
  if (offer) ok(res, present(offer, req.user));
};

// PATCH /api/offers/:id/respond { action: accept|reject|counter, counterAmount, message } -> owner side only
export const respondToOffer = async (req, res) => {
  const offer = await loadAuthorized(req, res);
  if (!offer) return;
  if (!canManageRecord(offer, req.user)) return fail(res, 404, "Offer not found.");
  if (!OPEN.includes(offer.status)) return fail(res, 400, `This offer is already ${offer.status}.`);

  const { action } = req.body;
  const response = String(req.body.message || "").trim().slice(0, 1000);
  let text;
  if (action === "accept") {
    offer.status = "accepted";
    text = `Offer of ${formatGHS(offer.amount)} accepted.`;
  } else if (action === "reject") {
    offer.status = "rejected";
    text = `Offer of ${formatGHS(offer.amount)} declined.`;
  } else if (action === "counter") {
    const counter = Math.round(Number(req.body.counterAmount));
    if (!Number.isFinite(counter) || counter < 1) return fail(res, 400, "Enter a valid counter offer amount.");
    offer.status = "countered";
    offer.counterAmount = counter;
    text = `Counter offer: ${formatGHS(counter)} (you offered ${formatGHS(offer.amount)}).`;
  } else {
    return fail(res, 400, "Choose accept, reject or counter.");
  }
  offer.response = response;
  offer.respondedAt = new Date();

  // Accepting a sale offer reserves the property; it is only marked sold when the sale completes
  if (action === "accept" && offer.property?.listingType === "Sale") {
    await Property.updateOne({ _id: offer.property._id, availability: "Available" }, { availability: "Under Offer" });
  }

  if (offer.property?._id) await note(offer, offer.property, req.user, "owner", [text, response].filter(Boolean).join("\n\n"));
  await offer.save();
  await notifyUser(offer.customer._id || offer.customer, {
    type: "offer",
    title: { accept: "Your offer was accepted", reject: "Your offer was declined", counter: "You received a counter offer" }[action],
    message: `${text} (${offer.property?.title || "property"})`,
    link: "/account/offers",
  });
  ok(res, present(offer, req.user), "Offer updated");
};

// PATCH /api/offers/:id/withdraw -> the customer takes back their own offer
export const withdrawOffer = async (req, res) => {
  const offer = await loadAuthorized(req, res);
  if (!offer) return;
  if (!same(offer.customer, req.user)) return fail(res, 403, "Only the customer who made this offer can withdraw it.");
  if (!OPEN.includes(offer.status)) return fail(res, 400, `This offer is already ${offer.status}.`);
  offer.status = "withdrawn";
  if (offer.property?._id) await note(offer, offer.property, req.user, "customer", `Offer of ${formatGHS(offer.amount)} withdrawn.`);
  await offer.save();
  await notifyOwner(offer, { type: "offer", title: "Offer withdrawn", message: `${req.user.firstName} withdrew their ${formatGHS(offer.amount)} offer on "${offer.property?.title}".`, path: "offers" });
  ok(res, present(offer, req.user), "Offer withdrawn");
};
