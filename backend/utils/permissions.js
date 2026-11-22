import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import Property from "../models/Property.js";
import User from "../models/User.js";
import { getSettings } from "../models/Setting.js";
import { teamOf } from "./team.js";
import { ACCOUNT_TYPES, isOrganization } from "./accountTypes.js";

// Listing states that occupy a slot in the agent's plan limit
export const COUNTED_STATES = ["published", "pending"];

// The agent's account type comes from the stored application, never from a request
export const accountTypeOf = (user) =>
  ACCOUNT_TYPES.includes(user?.agentApplication?.agentType)
    ? user.agentApplication.agentType
    : "individual";

// Lifecycle of a subscription: active | expired | cancelled | pending | none
export const subscriptionState = (sub) => {
  if (!sub) return { status: "none", isActive: false };
  if (["cancelled", "pending", "expired"].includes(sub.status))
    return { status: sub.status, isActive: false };
  if (
    sub.status !== "active" ||
    !["paid", "waived"].includes(sub.paymentStatus)
  )
    return { status: "pending", isActive: false };
  if (
    !sub.expiresAt ||
    !Number.isFinite(new Date(sub.expiresAt).getTime()) ||
    new Date(sub.expiresAt) <= new Date()
  )
    return { status: "expired", isActive: false };
  return { status: "active", isActive: true };
};

// When the admin turns off "Require subscription", agents use the default plan (or the cheapest for their account type)
const waivedPlan = async (settings, accountType) => {
  const configured = settings.agent.defaultPlan
    ? await Plan.findById(settings.agent.defaultPlan).catch(() => null)
    : null;
  return (configured?.isActive ? configured : null) ||
    (await Plan.findOne({ isActive: true, accountType }).sort({ price: 1 })) ||
    (await Plan.findOne({ isActive: true }).sort({ price: 1 }));
};

/**
 * Everything the server needs to decide what an agent may do: plan, limits, usage and features.
 * Always computed from database records on each request, so an expired or changed plan
 * takes effect immediately. The frontend mirrors this for display; this is what is enforced.
 */
export const getAgentAccess = async (user) => {
  const settings = await getSettings();
  // Agency staff work under the owner's account: the owner's plan, listings and limits apply
  const team = teamOf(user);
  const owner =
    team.role === "owner" ? user : await User.findById(team.ownerId);
  const ownerUsable =
    Boolean(owner) &&
    owner.role === "agent" &&
    owner.isActive === true &&
    owner.agentApplication?.status === "approved" &&
    isOrganization(accountTypeOf(owner));
  const account = team.role === "owner" ? user : ownerUsable ? owner : null;
  const subscription = account?.subscription
    ? await Subscription.findById(account.subscription).populate("plan")
    : null;
  const state = subscriptionState(subscription);
  const accountType = accountTypeOf(account || user);

  const waived =
    Boolean(account) &&
    user.role === "agent" &&
    !settings.agent.requireSubscription &&
    !state.isActive;
  const plan = waived
    ? await waivedPlan(settings, accountType)
    : subscription?.plan || null;

  const isActive =
    user.role === "agent" &&
    user.isActive &&
    Boolean(account) &&
    Boolean(plan) &&
    (state.isActive || waived);
  const [activeCount, featuredCount, memberCount] = await Promise.all([
    Property.countDocuments({
      owner: team.ownerId,
      status: { $in: COUNTED_STATES },
    }),
    Property.countDocuments({
      owner: team.ownerId,
      status: "published",
      isFeatured: true,
    }),
    isOrganization(accountType)
      ? User.countDocuments({ "agency.owner": team.ownerId })
      : 0,
  ]);

  return {
    settings,
    subscription,
    state,
    plan,
    accountType,
    isActive,
    ownerId: team.ownerId, // whose listings and leads these are
    teamRole: team.role, // owner | manager | agent
    isOrganization: isOrganization(accountType),
    teamMemberLimit: isOrganization(accountType)
      ? (plan?.teamMemberLimit ?? 0)
      : 0,
    memberCount,
    propertyLimit: plan?.propertyLimit ?? 0,
    imageLimit: Math.min(plan?.imageLimit ?? 0, settings.property.maxImages),
    featuredLimit: plan?.featuredPropertyLimit ?? 0,
    activeCount,
    featuredCount,
    canManageInquiries: isActive && plan?.inquiryManagement === "full",
    // Features lock as soon as the subscription stops being active
    internalChat: isActive && plan?.internalChat === true,
  };
};

/**
 * Which agents may use NyaFie chat, for many agents at once (listing cards and conversations).
 * Same rule as getAgentAccess().internalChat: an active account with an active plan that includes chat.
 */
export const chatEnabledAgents = async (users) => {
  const agents = users.filter(
    (user) => user?.role === "agent" && user.isActive,
  );
  if (!agents.length) return new Set();
  const ids = agents
    .map((user) => user.subscription?._id ?? user.subscription)
    .filter(Boolean);
  // Settings alongside the subscriptions (and their plans): two round trips in a row instead of three
  const [settings, subscriptions] = await Promise.all([
    getSettings(),
    ids.length ? Subscription.find({ _id: { $in: ids } }).populate("plan") : [],
  ]);
  const byId = new Map(subscriptions.map((sub) => [String(sub._id), sub]));
  const fallback = settings.agent.requireSubscription ? null : new Map();
  const enabled = new Set();
  for (const user of agents) {
    const subscription = byId.get(
      String(user.subscription?._id ?? user.subscription),
    );
    let plan = subscriptionState(subscription).isActive
      ? subscription.plan
      : null;
    if (!plan && fallback) {
      const type = accountTypeOf(user);
      if (!fallback.has(type))
        fallback.set(type, await waivedPlan(settings, type));
      plan = fallback.get(type);
    }
    if (plan?.internalChat) enabled.add(String(user._id));
  }
  return enabled;
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

/**
 * Photo limits after a downgrade: existing photos are never deleted. A gallery that is already
 * over the plan's limit can be reordered or trimmed, but it can't take new photos or grow.
 */
export const withinImageLimit = (images, limit, existing = []) => {
  if (images.length <= limit) return true;
  const kept = new Set(existing.map(String));
  return (
    images.length <= existing.length &&
    images.every((src) => kept.has(String(src)))
  );
};
