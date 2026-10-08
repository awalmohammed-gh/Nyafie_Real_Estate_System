import crypto from "crypto";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Offer from "../models/Offer.js";
import Rental from "../models/Rental.js";
import SaleRequest from "../models/SaleRequest.js";
import Payment from "../models/Payment.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import Review from "../models/Review.js";
import { syncPropertyRating } from "../utils/reviews.js";
import Setting, { getSettings } from "../models/Setting.js";
import { validateSection } from "../utils/settingsValidation.js";
import { paymentStatus } from "../utils/paystack.js";
import { COUNTED_STATES, subscriptionState } from "../utils/permissions.js";
import { checkPropertyOptions, pickPropertyFields, validateForPublishing } from "./propertyController.js";
import { resolveImages } from "../utils/uploadImages.js";
import { updateInquiryStatus } from "./inquiryController.js";
import { activateSubscription } from "./subscriptionController.js";
import { ok, fail } from "../utils/response.js";
import { prepareHotelFields, saveHotelProperty } from "../utils/hotel.js";

const DAY = 24 * 60 * 60 * 1000;

// ---------- Users ----------

// GET /api/admin/users -> every account with its current subscription and activity counts
export const listUsers = async (_req, res) => {
  const [users, inquiries, properties] = await Promise.all([
    User.find().populate("subscription").sort({ createdAt: -1 }),
    Inquiry.find().select("customer email"),
    Property.find({ ownerType: "agent" }).select("owner status"),
  ]);
  const data = users.map((u) => ({
    ...u.toJSON(),
    savedCount: u.savedProperties.length,
    inquiriesCount: inquiries.filter((i) => String(i.customer) === String(u._id) || i.email === u.email).length,
    activeProperties: properties.filter((p) => String(p.owner) === String(u._id) && COUNTED_STATES.includes(p.status)).length,
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

// PUT /api/admin/users/:id -> name, email, phone
export const updateUser = async (req, res) => {
  const user = await User.findById(req.params.id).catch(() => null);
  if (!user) return fail(res, 404, "User not found.");
  const { firstName, lastName, email, phone } = req.body;
  const invalidText = (value, max) => value !== undefined && (typeof value !== "string" || value.trim().length > max);
  if (invalidText(firstName, 80) || invalidText(lastName, 80) || invalidText(phone, 30)) return fail(res, 400, "Check the name and phone fields.");
  if (email !== undefined) {
    if (typeof email !== "string" || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, "Enter a valid email address.");
    if (await User.exists({ email: email.toLowerCase(), _id: { $ne: user._id } })) return fail(res, 409, "Another account already uses this email.");
    user.email = email;
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
  const id = user._id;
  const conversations = await Conversation.find({ customer: id }).select("_id");
  const reviewed = await Review.distinct("property", { user: id });
  await Promise.all([
    Offer.deleteMany({ customer: id, status: { $ne: "accepted" } }),
    Rental.deleteMany({ customer: id, paymentStatus: { $ne: "paid" } }),
    SaleRequest.deleteMany({ customer: id, status: { $ne: "completed" }, paymentStatus: { $ne: "confirmed" } }),
    Payment.deleteMany({ customer: id, status: { $in: ["pending", "failed"] } }),
    Message.deleteMany({ conversation: { $in: conversations.map((c) => c._id) } }),
    Conversation.deleteMany({ customer: id }),
    Inquiry.deleteMany({ customer: id }),
    Notification.deleteMany({ recipient: id }),
    Review.deleteMany({ user: id }),
  ]);
  await Promise.all(reviewed.map((propertyId) => syncPropertyRating(propertyId)));
  await user.deleteOne();
  ok(res, null, "User deleted");
};

// ---------- Agent subscriptions ----------

const newReference = () => `HB-ADM-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

// PATCH /api/admin/agents/:id/subscription { action, planId?, days? }
export const manageSubscription = async (req, res) => {
  const { action, planId, days } = req.body;
  const user = await User.findById(req.params.id).populate("subscription").catch(() => null);
  if (!user || user.role !== "agent") return fail(res, 404, "Agent not found.");
  const current = user.subscription;

  if (action === "changePlan") {
    const plan = await Plan.findById(planId).catch(() => null);
    if (!plan) return fail(res, 404, "Plan not found.");
    if (current) {
      // Keep the paid-up period; the new plan's limits apply immediately
      current.plan = plan._id;
      current.planName = plan.name;
      await current.save();
    } else {
      const subscription = await Subscription.create({
        user: user._id, plan: plan._id, planName: plan.name, amount: 0, paymentReference: newReference(), paymentMethod: "Admin",
      });
      await activateSubscription(subscription, { paymentStatus: "waived" });
    }
    return ok(res, null, `Plan changed to ${plan.name}`);
  }

  if (!current) return fail(res, 400, "This agent has no subscription.");

  if (action === "extend") {
    const extra = Number(days);
    if (!(extra > 0)) return fail(res, 400, "Enter a number of days to extend by.");
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
    if (current.status === "pending" || current.paymentStatus === "pending") {
      await activateSubscription(current); // admin confirms a pending payment
    } else {
      const plan = await Plan.findById(current.plan);
      const now = new Date();
      current.status = "active";
      current.startDate = now;
      current.expiresAt = new Date(now.getTime() + (plan?.duration || 30) * DAY);
      await current.save();
    }
    return ok(res, null, "Subscription activated");
  }

  fail(res, 400, "Unknown action.");
};

// GET /api/admin/subscriptions -> every subscription record (also the payment history)
export const listSubscriptions = async (_req, res) => {
  ok(res, await Subscription.find().sort({ createdAt: -1 }));
};

// ---------- Properties ----------

// GET /api/admin/properties -> every listing, admin and agent
export const listProperties = async (_req, res) => {
  ok(res, await Property.find().sort({ createdAt: -1 }));
};

// Public contact for admin-owned listings: the business details from Settings
const platformContact = (settings) => ({ id: "homebase", name: settings.general.siteName, phone: settings.contact.phone, email: settings.contact.email });

// POST /api/admin/properties -> admin-owned listing. No plan limits and no review:
// it is published straight away (or saved as a draft). The admin is always the owner.
export const createProperty = async (req, res) => {
  const settings = await getSettings();
  const fields = pickPropertyFields(req.body);
  await prepareHotelFields(fields, req.body, null, settings.property.maxImages);
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
    contact: { ...platformContact(settings), ...fields.contact, id: "homebase" },
    images: await resolveImages(images),
    owner: req.user._id, // the signed-in admin, never taken from the request
    ownerType: "admin",
    status: draft ? "draft" : "published",
    reviewedAt: draft ? undefined : new Date(),
  });
  if (!draft) {
    const problem = validateForPublishing(property);
    if (problem) return fail(res, 400, problem);
    property.isFeatured = Boolean(req.body.isFeatured);
  }
  await property.save();
  ok(res, property, draft ? "Draft saved" : "Property published", 201);
};

// PUT /api/admin/properties/:id -> edit any listing (full details and photos)
export const updateProperty = async (req, res) => {
  const property = await Property.findById(req.params.id).catch(() => null);
  if (!property) return fail(res, 404, "Property not found.");
  const settings = await getSettings();
  const fields = pickPropertyFields(req.body);
  await prepareHotelFields(fields, req.body, property, settings.property.maxImages);
  const optionProblem = checkPropertyOptions(fields, settings, property);
  if (optionProblem) return fail(res, 400, optionProblem);
  if (fields.contact) fields.contact = { ...fields.contact, id: property.contact?.id || (property.ownerType === "admin" ? "homebase" : String(property.owner)) };
  Object.assign(property, fields);
  if (Array.isArray(req.body.images)) {
    if (req.body.images.length > settings.property.maxImages) return fail(res, 400, `Up to ${settings.property.maxImages} photos per property.`);
    property.images = await resolveImages(req.body.images);
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
  await saveHotelProperty(property);
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
  property.status = status;
  property.rejectionReason = status === "rejected" ? rejectionReason.trim() : "";
  property.reviewedAt = new Date();
  if (status !== "published") property.isFeatured = false;
  await property.save();
  ok(res, property, "Property updated");
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
  const current = await getSettings();
  const next = await validateSection(section, req.body, current);
  await Setting.updateOne({ key: "platform" }, { $set: { [section]: next, updatedBy: req.user._id } }, { upsert: true });
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
