import crypto from "crypto";
import { clearVisibleAgentsCache } from "../utils/marketplace.js";
import mongoose from "mongoose";
import { isOrganization } from "../utils/accountTypes.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Offer from "../models/Offer.js";
import Rental from "../models/Rental.js";
import SaleRequest from "../models/SaleRequest.js";
import Viewing from "../models/Viewing.js";
import Payment from "../models/Payment.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import Review from "../models/Review.js";
import { syncPropertyRating } from "../utils/reviews.js";
import Setting, { clearSettingsCache, getSettings } from "../models/Setting.js";
import { validateSection } from "../utils/settingsValidation.js";
import { newReference as paystackReference, paymentStatus } from "../utils/paystack.js";
import { COUNTED_STATES, subscriptionState } from "../utils/permissions.js";
import { checkPropertyOptions, pickPropertyFields, validateForPublishing } from "./propertyController.js";
import { locationSnapshot, settleLocation } from "../utils/autoLocate.js";
import { resolveImages } from "../utils/uploadImages.js";
import { destroyListingMedia, keepVideo, listingImages, removedMedia, resolveListingVideo } from "../utils/listingMedia.js";
import { updateInquiryStatus } from "./inquiryController.js";
import { activateSubscription, createAndActivateSubscription, processSubscriptionPayment } from "./subscriptionController.js";
import { removalImpact, removeProvider, restoreProvider, deletionPlan, permanentlyDeleteProvider } from "../utils/providerRemoval.js";
import { HttpError, ok, fail } from "../utils/response.js";
import { prepareHotelFields, saveHotelProperty } from "../utils/hotel.js";
import { REFUND_SUMMARY } from "./refundController.js";
import { inboxKey, sameInbox } from "../utils/signupEmail.js";
import { DISPUTE_SUMMARY } from "../utils/disputes.js";
import { alertSavedSearches } from "../utils/savedSearches.js";
import { markConfirmed } from "../utils/listingFreshness.js";

const DAY = 24 * 60 * 60 * 1000;

// ---------- Users ----------

// GET /api/admin/users -> every account with its current subscription and activity counts
export const listUsers = async (_req, res) => {
  // Counted by the database (grouped), instead of loading every inquiry and listing into memory
  const [users, byCustomer, byEmail, listings] = await Promise.all([
    User.find().populate("subscription").sort({ createdAt: -1 }),
    Inquiry.aggregate([{ $match: { customer: { $ne: null } } }, { $group: { _id: "$customer", count: { $sum: 1 } } }]),
    Inquiry.aggregate([{ $match: { customer: null } }, { $group: { _id: "$email", count: { $sum: 1 } } }]),
    Property.aggregate([{ $match: { ownerType: "agent", status: { $in: COUNTED_STATES } } }, { $group: { _id: "$owner", count: { $sum: 1 } } }]),
  ]);
  const counts = (rows) => new Map(rows.map((row) => [String(row._id), row.count]));
  const [customerCounts, emailCounts, listingCounts] = [counts(byCustomer), counts(byEmail), counts(listings)];
  const data = users.map((u) => ({
    ...u.toJSON(),
    savedCount: u.savedProperties.length,
    inquiriesCount: (customerCounts.get(String(u._id)) || 0) + (emailCounts.get(u.email) || 0),
    activeProperties: listingCounts.get(String(u._id)) || 0,
  }));
  ok(res, data);
};

// GET /api/admin/agents -> agents only (same shape as users)
export const listAgents = async (req, res) => {
  const users = await User.find({ role: "agent" }).populate({ path: "subscription", populate: { path: "plan" } }).sort({ createdAt: -1 });
  ok(res, users);
};

// GET /api/admin/users/:id
export const getUser = async (req, res) => {
  const user = await User.findById(req.params.id).populate("subscription").catch(() => null);
  if (!user) return fail(res, 404, "User not found.");
  ok(res, user);
};

// PUT /api/admin/users/:id -> name, email, phone of a customer or agent. Admin accounts are changed
// only by their owner on the Account page (an email change there needs the current password), so a
// signed-in admin session can't take over another admin's sign-in email, or skip that check for its own.
export const updateUser = async (req, res) => {
  const user = await User.findById(req.params.id).catch(() => null);
  if (!user) return fail(res, 404, "User not found.");
  if (user.role === "admin") return fail(res, 403, "Admin accounts are changed by their owner on the Account page.");
  const { firstName, lastName, email, phone } = req.body;
  const invalidText = (value, max) => value !== undefined && (typeof value !== "string" || value.trim().length > max);
  if (invalidText(firstName, 80) || invalidText(lastName, 80) || invalidText(phone, 30)) return fail(res, 400, "Check the name and phone fields.");
  if (email !== undefined) {
    if (typeof email !== "string" || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, "Enter a valid email address.");
    const normalizedEmail = email.trim().toLowerCase();
    if (user.email !== normalizedEmail && await User.exists({ $and: [{ _id: { $ne: user._id } }, sameInbox(normalizedEmail)] })) return fail(res, 409, "Another account already uses this email.");
    if (user.email !== normalizedEmail) {
      user.emailKey = inboxKey(normalizedEmail);
      user.emailVerifiedAt = null;
      user.sessionVersion = crypto.randomUUID();
    }
    user.email = normalizedEmail;
  }
  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (phone !== undefined) user.phone = phone;
  await user.save();
  ok(res, await User.findById(user._id).populate("subscription"), "Account updated");
};

// PATCH /api/admin/users/:id/status { status: "active" | "suspended" }
export const setUserStatus = async (req, res) => {
  const user = await User.findById(req.params.id).catch(() => null);
  if (!user) return fail(res, 404, "User not found.");
  if (user.role === "admin") return fail(res, 403, "Admin accounts can't be suspended.");
  if (!["active", "suspended"].includes(req.body.status)) return fail(res, 400, "Choose active or suspended.");
  if (user.role === "agent") return fail(res, 400, "Manage agent approval and suspension from Agent Applications.");
  user.isActive = req.body.status !== "suspended";
  await user.save();
  ok(res, user, user.isActive ? "User activated" : "User suspended");
};

// DELETE /api/admin/users/:id -> customers only (agents are suspended or cancelled instead)
export const deleteUser = async (req, res) => {
  const user = await User.findById(req.params.id).catch(() => null);
  if (!user) return fail(res, 404, "User not found.");
  if (user.role !== "user") return fail(res, 403, "Only customer accounts can be deleted. Suspend agents instead.");

  // Remove the customer's open activity so it no longer shows (or counts) on the admin boards.
  // Money that actually changed hands stays on record: paid rentals, confirmed or completed purchases,
  // successful payments and accepted offers (they appear as "Deleted user").
  // One transaction: the account and all of this goes together, or nothing is deleted. (Steps run
  // one after another: a transaction's operations can't run in parallel.)
  const id = user._id;
  await mongoose.connection.transaction(async (session) => {
    const conversations = await Conversation.find({ customer: id }).select("_id").session(session);
    const reviewed = await Review.distinct("property", { user: id }).session(session);
    const steps = [
      () => Offer.deleteMany({ customer: id, status: { $ne: "accepted" } }, { session }),
      () => Viewing.deleteMany({ customer: id }, { session }),
      () => Rental.deleteMany({ customer: id, paymentStatus: { $ne: "paid" } }, { session }),
      () => SaleRequest.deleteMany({ customer: id, status: { $ne: "completed" }, paymentStatus: { $ne: "confirmed" } }, { session }),
      () => Payment.deleteMany({ customer: id, status: { $in: ["pending", "failed"] } }, { session }),
      () => Message.deleteMany({ conversation: { $in: conversations.map((c) => c._id) } }, { session }),
      () => Conversation.deleteMany({ customer: id }, { session }),
      () => Inquiry.deleteMany({ customer: id }, { session }),
      () => Notification.deleteMany({ recipient: id }, { session }),
      () => Review.deleteMany({ user: id }, { session }),
    ];
    for (const step of steps) await step();
    for (const propertyId of reviewed) await syncPropertyRating(propertyId, session);
    const deleted = await User.deleteOne({ _id: id, role: "user" }, { session });
    if (!deleted.deletedCount) throw new HttpError(409, "This account changed while it was being deleted. Refresh and try again.");
  });
  ok(res, null, "User deleted");
};

// ---------- Provider removal ----------

// GET /api/admin/agents/:id/removal -> what removing this provider will change
export const getRemovalImpact = async (req, res) => ok(res, await removalImpact(req.params.id));

// POST /api/admin/agents/:id/remove { reason, note } -> deactivate; nothing is deleted
export const removeAgent = async (req, res) => {
  const result = await removeProvider(req.params.id, req.user, { reason: req.body.reason, note: req.body.note });
  clearVisibleAgentsCache();
  ok(res, result, `${result.name} was removed`);
};

// POST /api/admin/agents/:id/restore { republish } -> the account only, unless listings are asked for
export const restoreAgent = async (req, res) => {
  const result = await restoreProvider(req.params.id, req.user, { republish: req.body.republish === true });
  clearVisibleAgentsCache();
  ok(res, result, `${result.name} was restored`);
};

// GET /api/admin/agents/:id/deletion -> what a permanent delete would delete, anonymise and keep
export const getDeletionPlan = async (req, res) => {
  const { references, ...plan } = await deletionPlan(req.params.id); // eslint-disable-line no-unused-vars
  ok(res, plan);
};

// DELETE /api/admin/agents/:id { confirm } -> permanent; only for removed providers, typed confirmation
export const deleteAgentPermanently = async (req, res) => {
  const result = await permanentlyDeleteProvider(req.params.id, req.user, req.body?.confirm);
  clearVisibleAgentsCache();
  ok(res, result, result.mode === "erase" ? `${result.name} was permanently deleted` : `${result.name}'s personal details were permanently deleted`);
};

// ---------- Agent subscriptions ----------

// Same format as checkout references (e.g. HB-ADM-LX2K9A-3F9A1C), from the one generator
const newReference = () => paystackReference("HB-ADM");

// PATCH /api/admin/agents/:id/subscription { action, planId?, days? }
export const manageSubscription = async (req, res) => {
  const { action, planId, days } = req.body;
  const user = await User.findById(req.params.id).populate("subscription").catch(() => null);
  if (!user || user.role !== "agent") return fail(res, 404, "Agent not found.");
  if (user.agentApplication?.status === "removed") return fail(res, 409, "This provider was removed. Restore them before changing their plan.");
  const current = user.subscription;

  if (action === "changePlan") {
    const plan = await Plan.findById(planId).catch(() => null);
    if (!plan) return fail(res, 404, "Plan not found.");
    if (current) {
      // Keep the paid-up period; the new plan's limits apply immediately. The plan and the account
      // type change together.
      await mongoose.connection.transaction(async (session) => {
        await Subscription.updateOne({ _id: current._id }, { $set: { plan: plan._id, planName: plan.name, accountType: plan.accountType } }, { session });
        // An agency or company plan makes the account that type (admins assign plans deliberately)
        if (isOrganization(plan.accountType) && user.agentApplication?.agentType !== plan.accountType) {
          await User.updateOne({ _id: user._id }, { $set: { "agentApplication.agentType": plan.accountType } }, { session });
        }
      });
    } else {
      await createAndActivateSubscription({
        user: user._id, plan: plan._id, planName: plan.name, accountType: plan.accountType, planPrice: plan.price, durationDays: plan.duration, amount: 0, paymentReference: newReference(), paymentMethod: "Admin",
      }, { paymentStatus: "waived" });
    }
    return ok(res, null, `Plan changed to ${plan.name}`);
  }

  if (!current) return fail(res, 400, "This agent has no subscription.");

  if (action === "extend") {
    const extra = Number(days);
    if (!Number.isInteger(extra) || extra < 1 || extra > 3650) return fail(res, 400, "Enter a whole number of days from 1 to 3650.");
    const base = subscriptionState(current).isActive ? new Date(current.expiresAt) : new Date();
    current.expiresAt = new Date(base.getTime() + extra * DAY);
    if (current.status !== "pending") current.status = "active";
    await current.save();
    return ok(res, null, "Subscription extended");
  }

  if (action === "cancel") {
    current.status = "cancelled";
    current.cancelledAt = new Date();
    await current.save();
    return ok(res, null, "Subscription cancelled");
  }

  if (action === "activate") {
    if (current.paymentMethod === "Paystack" && current.paymentStatus === "pending") {
      // Ask Paystack first: a completed payment is activated and recorded as paid, as usual
      const outcome = await processSubscriptionPayment(current).catch(() => null);
      if (outcome?.state === "paid") return ok(res, null, "Payment confirmed with Paystack. Subscription activated.");
      // No verified payment: grant the plan as complimentary, as its own record, so the unpaid
      // checkout is never counted as revenue (if it is paid later, it is processed normally)
      const plan = await Plan.findById(current.plan);
      if (!plan) return fail(res, 404, "This checkout's plan no longer exists. Assign a plan instead.");
      await createAndActivateSubscription({
        user: user._id, plan: plan._id, planName: plan.name, accountType: plan.accountType, planPrice: plan.price, durationDays: current.durationDays ?? plan.duration,
        amount: 0, paymentReference: newReference(), paymentMethod: "Admin", note: `Complimentary: activated by an admin; checkout ${current.paymentReference} had no verified payment`,
      }, { paymentStatus: "waived" });
      return ok(res, null, "Activated as complimentary: Paystack has no completed payment for this checkout.");
    }
    if (current.status === "pending" || current.paymentStatus === "pending") {
      await activateSubscription(current, { paymentStatus: "waived" }); // no money was verified: complimentary
    } else {
      const plan = await Plan.findById(current.plan);
      const now = new Date();
      current.status = "active";
      current.startDate = now;
      current.expiresAt = new Date(now.getTime() + (current.durationDays ?? plan?.duration ?? 30) * DAY);
      await current.save();
    }
    return ok(res, null, "Subscription activated");
  }

  fail(res, 400, "Unknown action.");
};

// GET /api/admin/subscriptions -> every subscription record (also the payment history)
export const listSubscriptions = async (_req, res) => {
  ok(res, await Subscription.find().sort({ createdAt: -1 }).populate("refund", REFUND_SUMMARY).populate("dispute", DISPUTE_SUMMARY));
};

// ---------- Properties ----------

// GET /api/admin/properties -> every listing, admin and agent
export const listProperties = async (_req, res) => {
  ok(res, await Property.find().sort({ createdAt: -1 }));
};

// Public contact for admin-owned listings: the business details from Settings
const platformContact = (settings) => ({ id: "nyafie", name: settings.general.siteName, phone: settings.contact.phone, email: settings.contact.email });

// POST /api/admin/properties -> admin-owned listing. No plan limits and no review:
// it is published straight away (or saved as a draft). The admin is always the owner.
export const createProperty = async (req, res) => {
  const settings = await getSettings();
  const fields = pickPropertyFields(req.body);
  await prepareHotelFields(fields, req.body, null, settings.property.maxImages, [req.user._id]);
  const images = Array.isArray(req.body.images) ? req.body.images : [];
  if (!fields.title || fields.title.length < 3) return fail(res, 400, "Give the property a title (at least 3 characters).");
  const optionProblem = checkPropertyOptions(fields, settings);
  if (optionProblem) return fail(res, 400, optionProblem);
  if (images.length > settings.property.maxImages) return fail(res, 400, `Up to ${settings.property.maxImages} photos per property.`);

  const draft = req.body.status === "draft";
  const property = new Property({
    listingType: "Sale",
    propertyType: "Apartment",
    price: 0,
    ...fields,
    contact: { ...platformContact(settings), ...fields.contact, id: "nyafie" },
    images: await resolveImages(images, { uploaderIds: [req.user._id] }),
    owner: req.user._id, // the signed-in admin, never taken from the request
    ownerType: "admin",
    status: draft ? "draft" : "published",
    reviewedAt: draft ? undefined : new Date(),
    availabilityConfirmedAt: new Date(), // a new listing is fresh (utils/listingFreshness.js)
    // An uploaded video (optional), checked against what Cloudinary stored (utils/listingMedia.js)
    videoFile: (await resolveListingVideo(req.body, null, [req.user._id])).video,
  });
  if (!draft) {
    const problem = validateForPublishing(property);
    if (problem) return fail(res, 400, problem);
    property.isFeatured = Boolean(req.body.isFeatured);
  }
  const before = null;
  if (fields.location) {
    const settled = await settleLocation(property.location, before);
    property.set({ "location.latitude": settled.latitude, "location.longitude": settled.longitude, "location.pinSource": settled.pinSource });
  }
  await property.save();
  await keepVideo(property.videoFile);
  if (!draft) await alertSavedSearches(property); // customers whose saved searches match
  ok(res, property, draft ? "Draft saved" : "Property published", 201);
};

// PUT /api/admin/properties/:id -> edit any listing (full details and photos)
export const updateProperty = async (req, res) => {
  const property = await Property.findById(req.params.id).catch(() => null);
  if (!property) return fail(res, 404, "Property not found.");
  const settings = await getSettings();
  const fields = pickPropertyFields(req.body);
  await prepareHotelFields(fields, req.body, property, settings.property.maxImages, [req.user._id]);
  const optionProblem = checkPropertyOptions(fields, settings, property);
  if (optionProblem) return fail(res, 400, optionProblem);
  if (fields.contact) fields.contact = { ...fields.contact, id: property.contact?.id || (property.ownerType === "admin" ? "nyafie" : String(property.owner)) };
  const wasPublished = property.status === "published";
  const before = locationSnapshot(property.location);
  const mediaBefore = { images: listingImages(property), videoFile: property.videoFile };
  const { video } = await resolveListingVideo(req.body, property.videoFile, [req.user._id]);
  Object.assign(property, fields);
  property.videoFile = video;
  markConfirmed(property); // editing a listing confirms it is current
  if (Array.isArray(req.body.images)) {
    if (req.body.images.length > settings.property.maxImages) return fail(res, 400, `Up to ${settings.property.maxImages} photos per property.`);
    property.images = await resolveImages(req.body.images, { current: mediaBefore.images, uploaderIds: [req.user._id] });
  }
  // Admin listings can be saved as a draft (unpublished) or published from the editor
  if (property.ownerType === "admin" && ["draft", "published"].includes(req.body.status)) {
    if (req.body.status === "published") {
      const problem = validateForPublishing(property);
      if (problem) return fail(res, 400, problem);
      property.reviewedAt = new Date();
    } else {
      property.isFeatured = false;
    }
    property.status = req.body.status;
  }
  if (req.body.isFeatured !== undefined && property.status === "published") property.isFeatured = Boolean(req.body.isFeatured);
  if (["published", "pending"].includes(property.status)) {
    const problem = validateForPublishing(property);
    if (problem) return fail(res, 400, problem);
  }
  if (fields.location) {
    const settled = await settleLocation(property.location, before);
    property.set({ "location.latitude": settled.latitude, "location.longitude": settled.longitude, "location.pinSource": settled.pinSource });
  }
  await saveHotelProperty(property);
  // Saved: the new video is kept; photos and a video the listing no longer uses are deleted from Cloudinary
  await keepVideo(property.videoFile);
  await destroyListingMedia(removedMedia(mediaBefore, property), property._id);
  if (!wasPublished && property.status === "published") await alertSavedSearches(property);
  ok(res, property, "Property updated");
};

// PATCH /api/admin/properties/:id/status { status, rejectionReason? }
export const setPropertyStatus = async (req, res) => {
  const { status, rejectionReason = "" } = req.body;
  if (!["draft", "pending", "published", "rejected", "suspended"].includes(status)) return fail(res, 400, "Invalid status.");
  if (status === "rejected" && rejectionReason.trim().length < 5) return fail(res, 400, "Give the agent a reason for the rejection.");

  const property = await Property.findById(req.params.id).catch(() => null);
  if (!property) return fail(res, 404, "Property not found.");
  if (["published", "pending"].includes(status)) {
    const problem = validateForPublishing(property);
    if (problem) return fail(res, 400, problem);
  }
  const wasPublished = property.status === "published";
  property.status = status;
  property.rejectionReason = status === "rejected" ? rejectionReason.trim() : "";
  property.reviewedAt = new Date();
  if (status !== "published") property.isFeatured = false;
  await property.save();
  if (!wasPublished && status === "published") await alertSavedSearches(property); // e.g. an approved agent listing
  ok(res, property, "Property updated");
};

// PATCH /api/admin/properties/:id/confirm-availability -> any listing: confirmed as still available
export const confirmPropertyAvailability = async (req, res) => {
  const property = await Property.findById(req.params.id).catch(() => null);
  if (!property) return fail(res, 404, "Property not found.");
  const wasHidden = Boolean(property.staleSince);
  markConfirmed(property);
  await property.save();
  if (wasHidden) await alertSavedSearches(property);
  ok(res, property, wasHidden ? "Listing confirmed and shown again" : "Listing confirmed as still available");
};

// PATCH /api/admin/properties/:id/feature { isFeatured }
export const setPropertyFeatured = async (req, res) => {
  const property = await Property.findById(req.params.id).catch(() => null);
  if (!property) return fail(res, 404, "Property not found.");
  if (req.body.isFeatured && property.status !== "published") return fail(res, 400, "Only published properties can be featured.");
  property.isFeatured = Boolean(req.body.isFeatured);
  await property.save();
  ok(res, property, property.isFeatured ? "Marked as featured" : "Removed from featured");
};

// ---------- Inquiries ----------

// GET /api/admin/inquiries
export const listInquiries = async (_req, res) => {
  ok(res, await Inquiry.find().sort({ createdAt: -1 }));
};

// PATCH /api/admin/inquiries/:id/status
export const setInquiryStatus = async (req, res) => {
  const inquiry = await Inquiry.findById(req.params.id).catch(() => null);
  if (!inquiry) return fail(res, 404, "Inquiry not found.");
  await updateInquiryStatus(inquiry, req.body.status, res);
};

// ---------- Settings ----------

// PUT /api/admin/settings/:section -> validates and saves one section (admins only, see adminRoutes)
export const updateSettings = async (req, res) => {
  const { section } = req.params;
  // Saving reads and returns the stored settings, never this instance's short-lived copy
  clearSettingsCache();
  const current = await getSettings();
  const next = await validateSection(section, req.body, current);
  await Setting.updateOne({ key: "platform" }, { $set: { [section]: next, updatedBy: req.user._id } }, { upsert: true });
  clearSettingsCache();
  const saved = await getSettings();

  // Admin-owned listings show the business name and contact details: keep them in step
  if (section === "general" || section === "contact") {
    const { id, ...contact } = platformContact(saved);
    await Property.updateMany({ ownerType: "admin" }, { $set: { contact: { id, ...contact } } });
  }
  ok(res, saved, "Settings saved");
};

// GET /api/admin/settings/payment-status -> what is configured in .env, never the keys themselves
export const getPaymentStatus = async (_req, res) => ok(res, paymentStatus());

// PUT /api/admin/account -> the signed-in admin's own details. Changing the sign-in email needs the current password.
export const updateAccount = async (req, res) => {
  const admin = await User.findById(req.user._id).select("+password");
  const { firstName, lastName, phone = "", email, currentPassword } = req.body;
  if (!String(firstName || "").trim() || !String(lastName || "").trim()) return fail(res, 400, "First and last name are required.");
  const nextEmail = String(email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(nextEmail)) return fail(res, 400, "Enter a valid email address.");

  if (nextEmail !== admin.email) {
    if (!(await admin.matchPassword(String(currentPassword || "")))) return fail(res, 400, "Enter your current password to change your sign-in email.");
    if (await User.exists({ email: nextEmail, _id: { $ne: admin._id } })) return fail(res, 409, "Another account already uses this email.");
    admin.email = nextEmail;
  }
  admin.firstName = String(firstName).trim();
  admin.lastName = String(lastName).trim();
  admin.phone = String(phone).trim().slice(0, 30);
  await admin.save();
  ok(res, await User.findById(admin._id).populate("subscription"), "Account updated");
};
