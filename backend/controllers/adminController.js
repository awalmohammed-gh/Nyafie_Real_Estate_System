import crypto from "crypto";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Setting, { defaultSettings, getSettings } from "../models/Setting.js";
import { COUNTED_STATES, subscriptionState } from "../utils/permissions.js";
import { pickPropertyFields, validateForPublishing } from "./propertyController.js";
import { resolveImages } from "../utils/uploadImages.js";
import { updateInquiryStatus } from "./inquiryController.js";
import { activateSubscription } from "./subscriptionController.js";
import { ok, fail } from "../utils/response.js";

const DAY = 24 * 60 * 60 * 1000;

// ---------- Dashboard ----------

// GET /api/admin/dashboard
export const dashboard = async (_req, res) => {
  const [users, properties, inquiries, subscriptions] = await Promise.all([
    User.find({ role: { $ne: "admin" } }).populate("subscription").select("role isActive subscription createdAt"),
    Property.find().select("status ownerType owner"),
    Inquiry.countDocuments(),
    Subscription.find().select("status paymentStatus amount expiresAt"),
  ]);
  const agents = users.filter((u) => u.role === "agent");
  const agentStates = agents.map((a) => subscriptionState(a.subscription).status);

  ok(res, {
    totalUsers: users.length,
    totalAgents: agents.length,
    activeAgents: agents.filter((a, i) => a.isActive && agentStates[i] === "active").length,
    expiredAgents: agentStates.filter((s) => s === "expired").length,
    totalProperties: properties.length,
    publishedProperties: properties.filter((p) => p.status === "published").length,
    pendingProperties: properties.filter((p) => p.status === "pending").length,
    totalInquiries: inquiries,
    activeSubscriptions: agentStates.filter((s) => s === "active").length,
    expiredSubscriptions: agentStates.filter((s) => s === "expired").length,
    revenue: subscriptions.filter((s) => s.paymentStatus === "paid").reduce((sum, s) => sum + s.amount, 0),
  });
};

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
  if (email !== undefined) {
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, "Enter a valid email address.");
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
  user.isActive = req.body.status !== "suspended";
  await user.save();
  ok(res, user, user.isActive ? "User activated" : "User suspended");
};

// DELETE /api/admin/users/:id -> customers only (agents are suspended or cancelled instead)
export const deleteUser = async (req, res) => {
  const user = await User.findById(req.params.id).catch(() => null);
  if (!user) return fail(res, 404, "User not found.");
  if (user.role !== "user") return fail(res, 403, "Only customer accounts can be deleted. Suspend agents instead.");
  await user.deleteOne();
  ok(res, null, "User deleted");
};

// ---------- Agent subscriptions ----------

const newReference = () => `HB-ADM-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

// PATCH /api/admin/agents/:id/subscription { action, planId?, days? }
export const manageSubscription = async (req, res) => {
  const { action, planId, days } = req.body;
  const user = await User.findById(req.params.id).populate("subscription").catch(() => null);
  if (!user || user.role === "admin") return fail(res, 404, "Agent not found.");
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

// Public contact for HomeBase (admin) listings
const platformContact = (settings) => ({ id: "homebase", name: settings.platform.name, phone: settings.platform.phone, email: settings.platform.email });

// POST /api/admin/properties -> admin-owned listing. No plan limits and no review:
// it is published straight away (or saved as a draft). The admin is always the owner.
export const createProperty = async (req, res) => {
  const settings = await getSettings();
  const fields = pickPropertyFields(req.body);
  const images = Array.isArray(req.body.images) ? req.body.images : [];
  if (!fields.title || fields.title.length < 3) return fail(res, 400, "Give the property a title (at least 3 characters).");
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
  await property.save();
  ok(res, property, "Property updated");
};

// PATCH /api/admin/properties/:id/status { status, rejectionReason? }
export const setPropertyStatus = async (req, res) => {
  const { status, rejectionReason = "" } = req.body;
  if (!["draft", "pending", "published", "rejected", "suspended"].includes(status)) return fail(res, 400, "Invalid status.");
  if (status === "rejected" && rejectionReason.trim().length < 5) return fail(res, 400, "Give the agent a reason for the rejection.");

  const property = await Property.findById(req.params.id).catch(() => null);
  if (!property) return fail(res, 404, "Property not found.");
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

// PUT /api/admin/settings/:section
export const updateSettings = async (req, res) => {
  const { section } = req.params;
  if (!defaultSettings[section]) return fail(res, 404, "Unknown settings section.");
  // Only keys that exist in the defaults can be saved
  const allowed = Object.keys(defaultSettings[section]);
  const current = await getSettings();
  const next = { ...current[section] };
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) next[key] = req.body[key];
  });
  if (section === "property") next.maxImages = Math.min(50, Math.max(1, Number(next.maxImages) || 1));
  await Setting.updateOne({ key: "platform" }, { $set: { [section]: next } }, { upsert: true });
  ok(res, await getSettings(), "Settings saved");
};
