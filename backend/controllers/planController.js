import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import { ok, fail } from "../utils/response.js";
import { ACCOUNT_TYPES } from "../utils/accountTypes.js";

const pickPlan = (body) => {
  const out = {};
  if (body.name !== undefined) out.name = String(body.name).trim();
  if (body.tagline !== undefined) out.tagline = String(body.tagline).trim();
  ["price", "duration", "propertyLimit", "imageLimit", "featuredPropertyLimit", "teamMemberLimit", "sortOrder"].forEach((key) => {
    if (body[key] !== undefined) out[key] = Number(body[key]);
  });
  if (["basic", "standard", "advanced"].includes(body.analyticsLevel)) out.analyticsLevel = body.analyticsLevel;
  if (["basic", "full"].includes(body.inquiryManagement)) out.inquiryManagement = body.inquiryManagement;
  if (ACCOUNT_TYPES.includes(body.accountType)) out.accountType = body.accountType;
  ["priorityVisibility", "internalChat", "popular", "isActive"].forEach((key) => {
    if (body[key] !== undefined) out[key] = Boolean(body[key]);
  });
  if (Array.isArray(body.features)) out.features = body.features.map((f) => String(f).trim()).filter(Boolean);
  return out;
};

const validatePlan = (p, creating) => {
  if (creating && !p.name) return "Give the plan a name.";
  if (p.price !== undefined && !(p.price >= 0)) return "Price must be 0 or more.";
  if (p.duration !== undefined && !(p.duration >= 1)) return "Duration must be at least 1 day.";
  if (p.propertyLimit !== undefined && !(p.propertyLimit >= 1)) return "Property limit must be at least 1.";
  if (p.imageLimit !== undefined && !(p.imageLimit >= 1)) return "Image limit must be at least 1.";
  if (p.featuredPropertyLimit !== undefined && !(p.featuredPropertyLimit >= 0)) return "Featured limit can't be negative.";
  if (p.sortOrder !== undefined && !(Number.isInteger(p.sortOrder) && Math.abs(p.sortOrder) <= 1000)) return "Upgrade tier must be a whole number.";
  if (p.teamMemberLimit !== undefined && !(Number.isInteger(p.teamMemberLimit) && p.teamMemberLimit >= 0 && p.teamMemberLimit <= 500)) return "Team members must be a whole number from 0 to 500.";
  return null;
};

// The plan a provider's account is on (staff: their organisation's), so a retired plan still shows for its subscribers
const ownPlanId = async (user) => {
  if (user?.role !== "agent") return null;
  const holder = user.agency?.owner ? await User.findById(user.agency.owner._id || user.agency.owner).select("subscription") : user;
  const subscriptionId = holder?.subscription?._id || holder?.subscription;
  return subscriptionId ? (await Subscription.findById(subscriptionId).select("plan"))?.plan || null : null;
};

// GET /api/plans (active plans, plus the provider's own current plan; admins get all with ?all=true)
export const listPlans = async (req, res) => {
  const all = req.query.all === "true" && req.user?.role === "admin";
  const own = all ? null : await ownPlanId(req.user);
  const filter = all ? {} : own ? { $or: [{ isActive: true }, { _id: own }] } : { isActive: true };
  ok(res, await Plan.find(filter).sort({ sortOrder: 1, price: 1 }));
};

// POST /api/plans (admin)
export const createPlan = async (req, res) => {
  const data = pickPlan(req.body);
  const problem = validatePlan(data, true);
  if (problem) return fail(res, 400, problem);
  if (await Plan.exists({ name: data.name })) return fail(res, 409, "Another plan already uses this name.");
  ok(res, await Plan.create(data), "Plan created", 201);
};

// PUT /api/plans/:id (admin) - limits apply to subscribed agents immediately
export const updatePlan = async (req, res) => {
  const data = pickPlan(req.body);
  const problem = validatePlan(data, false);
  if (problem) return fail(res, 400, problem);
  if (data.name && (await Plan.exists({ name: data.name, _id: { $ne: req.params.id } }))) {
    return fail(res, 409, "Another plan already uses this name.");
  }
  const plan = await Plan.findByIdAndUpdate(req.params.id, data, { returnDocument: "after", runValidators: true }).catch(() => null);
  if (!plan) return fail(res, 404, "Plan not found.");
  ok(res, plan, "Plan updated");
};

// DELETE /api/plans/:id (admin) - only when nobody is actively subscribed
export const deletePlan = async (req, res) => {
  // Any subscription (active, past, or a checkout still being paid) needs its plan: an unpaid checkout
  // that is paid later is activated from it, and history and renewals refer to it
  if (await Subscription.exists({ plan: req.params.id })) return fail(res, 409, "This plan has subscriptions (current, past or being paid), so it can't be deleted. Deactivate it instead: it stops being offered.");
  const plan = await Plan.findByIdAndDelete(req.params.id).catch(() => null);
  if (!plan) return fail(res, 404, "Plan not found.");
  ok(res, null, "Plan deleted");
};
