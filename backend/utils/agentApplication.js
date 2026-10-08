import Subscription from "../models/Subscription.js";
import { getSettings } from "../models/Setting.js";
import { subscriptionState } from "./permissions.js";
import { HttpError } from "./response.js";

export const applicationStatus = (user) => user?.isActive === false ? "suspended" : user?.agentApplication?.status || "incomplete";
export const approvedAgent = (user) => user?.role === "agent" && user.isActive === true && user.agentApplication?.status === "approved";
export const validPhone = (value) => typeof value === "string" && /^\+?[\d\s().-]+$/.test(value.trim()) && /^\d{7,15}$/.test(value.replace(/\D/g, ""));

export const applicationRequirements = async (user) => {
  const settings = await getSettings();
  const subscription = user.subscription ? await Subscription.findById(user.subscription).populate("plan") : null;
  return {
    profileComplete: Boolean(user.agentApplication?.profileCompletedAt),
    requireSubscription: Boolean(settings.agent.requireSubscription),
    subscriptionSatisfied: !settings.agent.requireSubscription || Boolean(subscription?.plan && subscription.status === "active" && subscriptionState(subscription).isActive && ["paid", "waived"].includes(subscription.paymentStatus)),
  };
};

const STEP_PATHS = {
  profile: "/agent/onboarding/profile",
  subscription: "/agent/onboarding/subscription",
  payment_pending: "/agent/status",
  payment_failed: "/agent/status",
  review: "/agent/status",
  rejected: "/agent/status",
  suspended: "/agent/status",
  complete: "/agent/dashboard",
};

/**
 * Where an agent is in onboarding, computed only from server data:
 * Account -> Profile -> Subscription (paid + active) -> Admin review -> Dashboard.
 * The frontend uses `nextPath` to send the agent to the exact missing step; the API
 * guards (protectAgent, activeSubscription) enforce the same rules independently.
 */
export const onboardingState = async (user) => {
  const settings = await getSettings();
  const requireSubscription = Boolean(settings.agent.requireSubscription);
  const subscriptionId = user.subscription?._id || user.subscription;
  const [current, latest] = await Promise.all([
    subscriptionId ? Subscription.findById(subscriptionId) : null,
    Subscription.findOne({ user: user._id }).sort({ createdAt: -1 }),
  ]);
  const status = applicationStatus(user);
  const profileComplete = Boolean(user.agentApplication?.profileCompletedAt);
  const currentState = subscriptionState(current).status; // active | expired | cancelled | pending | none
  const subscriptionActive = Boolean(current && currentState === "active" && ["paid", "waived"].includes(current.paymentStatus));
  const subscriptionSatisfied = !requireSubscription || subscriptionActive;
  // A payment newer than the current subscription is the one the agent is waiting on
  const attempt = latest && !latest._id.equals(current?._id) ? latest : null;
  const attemptStatus = ["pending", "failed"].includes(attempt?.paymentStatus) ? attempt.paymentStatus : null;

  const payment = subscriptionActive ? current.paymentStatus : attemptStatus || (requireSubscription ? "none" : "not_required");
  const subscription = subscriptionActive ? "active"
    : attemptStatus === "pending" && currentState === "none" ? "pending"
      : !requireSubscription && currentState === "none" ? "not_required"
        : currentState;

  let step;
  if (status === "suspended") step = "suspended";
  else if (status === "approved") step = "complete";
  else if (status === "rejected") step = "rejected";
  else if (!profileComplete) step = "profile";
  else if (!subscriptionSatisfied) step = attemptStatus === "pending" ? "payment_pending" : attemptStatus === "failed" ? "payment_failed" : "subscription";
  else step = "review";

  const dashboardAccess = approvedAgent(user);
  return {
    step,
    nextPath: STEP_PATHS[step],
    requireSubscription,
    profile: profileComplete ? "complete" : "incomplete",
    payment, // paid | waived | pending | failed | none | not_required
    subscription, // active | pending | expired | cancelled | none | not_required
    application: status, // incomplete | pending | approved | rejected | suspended
    dashboardAccess, // approved + active account: the dashboard opens (read-only if the subscription lapsed)
    fullAccess: dashboardAccess && subscriptionSatisfied, // adding and editing listings too
    planId: String(attempt?.plan || current?.plan || "") || null,
    paymentReference: attemptStatus === "pending" ? attempt.paymentReference : null,
    expiresAt: subscriptionActive ? current.expiresAt : null,
  };
};

export const validateAgentProfile = (body) => {
  const text = (key, max, required = false) => {
    const value = typeof body[key] === "string" ? body[key].trim() : "";
    if ((required && !value) || value.length > max) throw new HttpError(400, `Enter a valid ${key.replace(/([A-Z])/g, " $1").toLowerCase()}.`);
    return value;
  };
  const agentType = body.agentType;
  if (!["individual", "agency"].includes(agentType)) throw new HttpError(400, "Choose Individual Agent or Agency / Company.");
  const yearsExperience = Number(body.yearsExperience);
  if (body.yearsExperience === "" || body.yearsExperience == null || !Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > 80) throw new HttpError(400, "Enter valid years of experience (0–80).");
  if (!validPhone(body.phone)) throw new HttpError(400, "Enter a valid phone number.");
  const whatsapp = text("whatsapp", 30);
  if (whatsapp && !validPhone(whatsapp)) throw new HttpError(400, "Enter a valid WhatsApp number.");
  return {
    firstName: text("firstName", 80, true), lastName: text("lastName", 80, true), phone: body.phone.trim(),
    profile: { agentType, companyName: agentType === "agency" ? text("companyName", 160, true) : "", region: text("region", 100, true), city: text("city", 100, true), officeAddress: text("officeAddress", 300, agentType === "agency"), ghanaPostGPS: text("ghanaPostGPS", 30), yearsExperience, bio: text("bio", 1500, true), whatsapp },
  };
};
