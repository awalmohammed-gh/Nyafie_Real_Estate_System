import { setAuthCookie } from "../utils/generateToken.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import { loadUser } from "./authController.js";
import { subscriptionState } from "../utils/permissions.js";
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
 * Activates a paid subscription without changing identity or approval. The server
 * calculates the dates: renewing the same active plan extends it, anything
 * else starts today and replaces the previous plan.
 */
export const activateSubscription = async (subscription, extra = {}) => {
  const user = await User.findById(subscription.user).populate("subscription");
  const plan = await Plan.findById(subscription.plan);
  if (!user || user.role !== "agent" || !plan) throw new Error("An agent account and valid plan are required.");
  const current = user.subscription;
  const renewing = current && subscriptionState(current).isActive && String(current.plan) === String(plan._id) && !current._id.equals(subscription._id);

  const now = new Date();
  const base = renewing ? new Date(current.expiresAt) : now;
  subscription.startDate = renewing ? current.startDate : now;
  subscription.expiresAt = new Date(base.getTime() + plan.duration * DAY);
  subscription.status = "active";
  subscription.paymentStatus = extra.paymentStatus || "paid";
  subscription.paidAt = now;
  await subscription.save();

  // The previous plan stops when a different plan (or a renewal record) takes over
  if (current && !current._id.equals(subscription._id) && current.status === "active") {
    current.status = renewing ? "expired" : "cancelled";
    await current.save();
  }

  user.subscription = subscription._id;
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

// POST /api/subscriptions/initialize { planId, method } -> starts a payment
export const initializePayment = async (req, res) => {
  if (req.user.role !== "agent") return fail(res, 403, "Create an agent account before choosing an agent subscription.");
  if (!req.user.isActive || ["rejected", "suspended"].includes(req.user.agentApplication?.status)) return fail(res, 403, "Check your agent application status before making a payment.");
  if (!req.user.agentApplication?.profileCompletedAt) return fail(res, 400, "Complete your agent profile before making a payment.");
  if ((await paymentMode()) === "disabled") return fail(res, 503, "Subscription payments are not available right now.");

  const plan = await Plan.findById(req.body.planId).catch(() => null);
  const current = req.user.subscription ? await Subscription.findById(req.user.subscription) : null;
  const isCurrentPlan = current && String(current.plan) === String(plan?._id);
  if (!plan || (!plan.isActive && !isCurrentPlan)) return fail(res, 404, "This plan is not available.");

  const reference = newReference("HB");
  const subscription = await Subscription.create({
    user: req.user._id,
    plan: plan._id,
    planName: plan.name,
    amount: plan.price,
    paymentReference: reference,
    paymentMethod: "Paystack",
    status: "pending",
    paymentStatus: "pending",
  });

  const result = await paystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: req.user.email,
      amount: Math.round(plan.price * 100), // pesewas
      currency: "GHS",
      reference,
      callback_url: `${process.env.CLIENT_URL}${req.user.agentApplication?.status === "approved" ? "/agent/subscription/checkout" : "/agent/checkout"}?reference=${reference}`,
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
