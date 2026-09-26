import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import Property from "../models/Property.js";
import { getSettings } from "../models/Setting.js";

// Listing states that occupy a slot in the agent's plan limit
export const COUNTED_STATES = ["published", "pending"];

// Lifecycle of a subscription: active | expired | cancelled | pending | none
export const subscriptionState = (sub) => {
  if (!sub) return { status: "none", isActive: false };
  if (sub.status === "cancelled" || sub.status === "pending") return { status: sub.status, isActive: false };
  if (!sub.expiresAt || new Date(sub.expiresAt) <= new Date()) return { status: "expired", isActive: false };
  return { status: "active", isActive: true };
};

/**
 * Everything the server needs to decide what an agent may do.
 * Mirrors the frontend permission system, but this is the one that is enforced.
 */
export const getAgentAccess = async (user) => {
  const settings = await getSettings();
  const subscription = user.subscription ? await Subscription.findById(user.subscription).populate("plan") : null;
  const state = subscriptionState(subscription);

  // When the admin turns off "Require subscription", agents use the default plan
  const waived = user.role === "agent" && !settings.agent.requireSubscription && !state.isActive;
  let plan = subscription?.plan || null;
  if (waived) {
    plan = (settings.agent.defaultPlan && (await Plan.findById(settings.agent.defaultPlan).catch(() => null))) ||
      (await Plan.findOne({ isActive: true }).sort({ price: 1 }));
  }

  const isActive = user.role === "agent" && user.isActive && Boolean(plan) && (state.isActive || waived);
  const [activeCount, featuredCount] = await Promise.all([
    Property.countDocuments({ owner: user._id, status: { $in: COUNTED_STATES } }),
    Property.countDocuments({ owner: user._id, status: "published", isFeatured: true }),
  ]);

  return {
    settings,
    subscription,
    state,
    plan,
    isActive,
    propertyLimit: plan?.propertyLimit ?? 0,
    imageLimit: Math.min(plan?.imageLimit ?? 0, settings.property.maxImages),
    featuredLimit: plan?.featuredPropertyLimit ?? 0,
    activeCount,
    featuredCount,
    canManageInquiries: isActive && plan?.inquiryManagement === "full",
  };
};

export const restrictionMessage = (access) => {
  const reasons = {
    expired: "Your subscription has expired. Renew to continue.",
    cancelled: "Your subscription was cancelled. Renew to continue.",
    pending: "Your payment is still being confirmed.",
    none: "An active subscription is required.",
  };
  return reasons[access.state.status] || "Your agent account is not active.";
};
