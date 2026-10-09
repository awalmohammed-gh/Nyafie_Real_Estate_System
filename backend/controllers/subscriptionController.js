import { setAuthCookie } from "../utils/generateToken.js";
import { paymentReturnUrl } from "../config/runtime.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import { loadUser } from "./authController.js";
import { subscriptionState } from "../utils/permissions.js";
import { quotePlan, presentQuote, upgradeOptions } from "../utils/planChange.js";
import { ok, fail } from "../utils/response.js";
import { paymentMode as paystackMode, paystack, newReference, paystackPaymentStatus } from "../utils/paystack.js";
import { getSettings } from "../models/Setting.js";
import { submitReadyApplication } from "./agentApplicationController.js";

// Subscription payments need Paystack and the admin's "subscription payments" switch
const paymentMode = async () => (paystackMode() === "paystack" && (await getSettings()).payments.subscriptionsEnabled ? "paystack" : "disabled");

const DAY = 24 * 60 * 60 * 1000;
// Unfinished payments are re-checked with Paystack for this long after checkout started
const RECHECK_WINDOW = 2 * DAY;

/**
 * Activates a paid subscription without changing approval. The server calculates the dates:
 * renewing the same active plan extends it, anything else (a new plan or an upgrade) starts
 * today and replaces the previous plan, which stays in the history as cancelled. Listings,
 * team members and usage are untouched; the new plan's limits apply from now on.
 */
export const activateSubscription = async (subscription, extra = {}) => {
  const user = await User.findById(subscription.user).populate("subscription");
  const plan = await Plan.findById(subscription.plan);
  if (!user || user.role !== "agent" || !plan) throw new Error("An agent account and valid plan are required.");
  // A removed provider's late payment is recorded but never reactivates the account's plan
  if (user.agentApplication?.status === "removed") {
    subscription.paymentStatus = extra.paymentStatus || "paid";
    subscription.paidAt = new Date();
    await subscription.save();
    return user;
  }
  const current = user.subscription;
  const renewing = current && subscriptionState(current).isActive && String(current.plan) === String(plan._id) && !current._id.equals(subscription._id);

  const now = new Date();
  const base = renewing ? new Date(current.expiresAt) : now;
  subscription.startDate = renewing ? current.startDate : now;
  subscription.expiresAt = new Date(base.getTime() + plan.duration * DAY);
  subscription.status = "active";
  subscription.accountType = plan.accountType;
  subscription.planPrice ??= plan.price;
  subscription.durationDays ??= plan.duration;
  subscription.paymentStatus = extra.paymentStatus || "paid";
  subscription.paidAt = now;
  if (current && !current._id.equals(subscription._id)) subscription.previousSubscription = current._id;
  await subscription.save();

  // The previous plan stops when a different plan (or a renewal record) takes over
  if (current && !current._id.equals(subscription._id) && current.status === "active") {
    current.status = renewing ? "expired" : "cancelled";
    await current.save();
  }

  user.subscription = subscription._id;
  // Providers only buy plans for their own account type; this only applies to a plan an admin assigned
  if (plan.accountType === "agency" && user.agentApplication?.agentType !== "agency") user.agentApplication.agentType = "agency";
  await user.save();
  await submitReadyApplication(user);
  return user;
};

/**
 * Re-checks the agent's latest unpaid payment with Paystack and records what Paystack says.
 * Catches agents who paid but closed the tab before returning to the site, and checkouts that
 * finished processing later. Only Paystack's answer can activate a subscription.
 */
export const reconcileLatestPayment = async (user) => {
  const attempt = await Subscription.findOne({ user: user._id }).sort({ createdAt: -1 });
  if (!attempt || !["pending", "failed"].includes(attempt.paymentStatus)) return;
  if (paystackMode() !== "paystack" || Date.now() - attempt.createdAt.getTime() > RECHECK_WINDOW) return;
  const status = await paystackPaymentStatus(attempt.paymentReference, attempt.amount).catch(() => null);
  if (status === "paid") await activateSubscription(attempt);
  else if (status && status !== attempt.paymentStatus) {
    attempt.paymentStatus = status;
    await attempt.save();
  }
};

// GET /api/subscriptions/current
export const currentSubscription = async (req, res) => {
  const subscription = req.user.subscription ? await Subscription.findById(req.user.subscription).populate("plan") : null;
  ok(res, { subscription, state: subscriptionState(subscription), paymentMode: await paymentMode() });
};

// Only agents with a saved profile and a usable account may buy a plan
const checkoutBlocker = (user) => {
  if (user.role !== "agent") return [403, "Create an agent account before choosing an agent subscription."];
  if (!user.isActive || ["rejected", "suspended"].includes(user.agentApplication?.status)) return [403, "Check your agent application status before making a payment."];
  if (!user.agentApplication?.profileCompletedAt) return [400, "Complete your agent profile before making a payment."];
  if (user.agency?.owner) return [403, "Your agency owner manages the subscription for the team."];
  return null;
};

// The plan the agent asked for: active plans, or their current plan (to renew it after it was retired)
const requestedPlan = async (user, planId) => {
  const plan = await Plan.findById(planId).catch(() => null);
  const current = user.subscription ? await Subscription.findById(user.subscription) : null;
  return plan && (plan.isActive || String(current?.plan) === String(plan._id)) ? plan : null;
};

// POST /api/subscriptions/quote { planId } -> what this plan costs the agent now (credit, amount, dates)
export const quoteSubscription = async (req, res) => {
  const blocked = checkoutBlocker(req.user);
  if (blocked) return fail(res, ...blocked);
  const plan = await requestedPlan(req.user, req.body.planId);
  if (!plan) return fail(res, 404, "This plan is not available.");
  ok(res, presentQuote(await quotePlan(req.user, plan)));
};

// GET /api/subscriptions/upgrades -> the owner's current plan and the higher plans of their account type
export const listUpgrades = async (req, res) => {
  const blocked = checkoutBlocker(req.user);
  if (blocked) return fail(res, ...blocked);
  const { status, currentPlan, upgrades } = await upgradeOptions(req.user);
  ok(res, {
    status,
    currentPlan,
    highest: status === "active" && upgrades.length === 0,
    upgrades: upgrades.map((quote) => ({ plan: quote.plan, quote: presentQuote(quote) })),
  });
};

// Starts paying for a plan: the plan and amount always come from the server, never from the request.
// `upgradeOnly` refuses anything that isn't a move to a higher plan (same plan, lower plans, no active plan).
const startCheckout = async (req, res, { upgradeOnly = false } = {}) => {
  const blocked = checkoutBlocker(req.user);
  if (blocked) return fail(res, ...blocked);
  const plan = await requestedPlan(req.user, req.body.planId);
  if (!plan) return fail(res, 404, upgradeOnly ? "This plan is no longer available as an upgrade." : "This plan is not available.");
  if (upgradeOnly && !plan.isActive) return fail(res, 404, "This plan is no longer available as an upgrade.");
  const quote = await quotePlan(req.user, plan);
  if (upgradeOnly && quote.kind !== "upgrade")
    return fail(res, 400, quote.kind === "renewal" ? "That's your current plan. Use Renew to extend it." : "You need an active plan to upgrade. Renew or choose a plan first.");
  const record = { user: req.user._id, plan: plan._id, planName: plan.name, accountType: plan.accountType, amount: quote.amount, planPrice: plan.price, durationDays: plan.duration, credit: quote.credit, kind: quote.kind, previousPlanName: quote.currentPlan?.name, status: "pending" };

  // The unused value of the current plan covers the whole change: nothing to pay
  if (quote.amount <= 0) {
    const subscription = await Subscription.create({ ...record, amount: 0, paymentReference: newReference("HB-CR"), paymentMethod: "Plan credit", paymentStatus: "pending" });
    const agent = await activateSubscription(subscription);
    setAuthCookie(res, agent._id, "agent");
    return ok(res, { mode: "credit", user: await loadUser(agent._id) }, `You're now on ${plan.name}`);
  }
  if ((await paymentMode()) === "disabled") return fail(res, 503, "Subscription payments are not available right now.");

  const reference = newReference("HB");
  const subscription = await Subscription.create({ ...record, paymentReference: reference, paymentMethod: "Paystack", paymentStatus: "pending" });

  const result = await paystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: req.user.email,
      amount: Math.round(quote.amount * 100), // pesewas
      currency: "GHS",
      reference,
      callback_url: `${paymentReturnUrl(req)}${req.user.agentApplication?.status === "approved" ? "/agent/subscription/checkout" : "/agent/checkout"}?reference=${reference}`,
      metadata: { userId: String(req.user._id), planId: String(plan._id) },
    }),
  });
  if (!result.status) {
    subscription.paymentStatus = "failed";
    await subscription.save();
    console.error("Paystack initialize failed:", result.message);
    return fail(res, 502, "Could not start the payment. Please try again.");
  }
  ok(res, { mode: "paystack", reference, authorizationUrl: result.data.authorization_url }, "Payment started");
};

// POST /api/subscriptions/initialize { planId } -> subscribe, renew or upgrade
export const initializePayment = (req, res) => startCheckout(req, res);

// POST /api/subscriptions/upgrade { planId } -> only a higher plan of the provider's own account type
export const upgradeSubscription = (req, res) => startCheckout(req, res, { upgradeOnly: true });

// POST /api/subscriptions/verify { reference } -> the server confirms the payment itself
export const verifyPayment = async (req, res) => {
  const { reference } = req.body;
  if (typeof reference !== "string" || !reference || reference.length > 100) return fail(res, 404, "Payment not found.");
  const subscription = await Subscription.findOne({ paymentReference: reference, user: req.user._id });
  if (!subscription) return fail(res, 404, "Payment not found.");

  // Idempotent: verifying twice (e.g. a page refresh) returns the same result
  if (subscription.paymentStatus === "paid") {
    await submitReadyApplication(req.user);
    if (req.user.role === "agent") setAuthCookie(res, req.user._id, "agent");
    return ok(res, await loadUser(req.user._id), "Payment already confirmed. Agent approval remains a separate requirement.");
  }

  if (paystackMode() === "disabled") return fail(res, 503, "Payments are not configured yet.");
  const status = await paystackPaymentStatus(subscription.paymentReference, subscription.amount);

  // Still processing (e.g. a mobile money prompt): nothing is activated until Paystack confirms
  if (status === "pending") {
    subscription.paymentStatus = "pending";
    await subscription.save();
    return ok(res, { paymentPending: true, reference: subscription.paymentReference }, "We are waiting for confirmation of your subscription payment.", 202);
  }
  if (status !== "paid") {
    subscription.paymentStatus = "failed";
    await subscription.save();
    return fail(res, 402, "Your payment was not completed. Your account and profile are saved, so you can try again.");
  }

  const agent = await activateSubscription(subscription);
  setAuthCookie(res, agent._id, "agent");
  ok(res, await loadUser(req.user._id), "Subscription activated");
};

// POST /api/subscriptions/cancel -> the agent cancels their own plan
export const cancelSubscription = async (req, res) => {
  const subscription = req.user.subscription ? await Subscription.findById(req.user.subscription) : null;
  if (!subscription || !subscriptionState(subscription).isActive) return fail(res, 400, "You don't have an active subscription.");
  subscription.status = "cancelled";
  subscription.cancelledAt = new Date();
  await subscription.save();
  ok(res, await loadUser(req.user._id), "Subscription cancelled");
};
