import crypto from "crypto";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import { loadUser } from "./authController.js";
import { subscriptionState } from "../utils/permissions.js";
import { ok, fail } from "../utils/response.js";

const DAY = 24 * 60 * 60 * 1000;
const PAYSTACK = "https://api.paystack.co";

// Test mode: allowed only outside production when no Paystack key is configured
const paymentMode = () => {
  if (process.env.PAYSTACK_SECRET_KEY) return "paystack";
  return process.env.NODE_ENV === "production" ? "disabled" : "test";
};

const paystack = async (path, options = {}) => {
  const response = await fetch(`${PAYSTACK}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
  });
  return response.json();
};

/**
 * Activates a paid subscription and makes the user an agent. The server
 * calculates the dates: renewing the same active plan extends it, anything
 * else starts today and replaces the previous plan.
 */
export const activateSubscription = async (subscription, extra = {}) => {
  const user = await User.findById(subscription.user).populate("subscription");
  const plan = await Plan.findById(subscription.plan);
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
  if (user.role !== "admin") user.role = "agent";
  await user.save();
  return user;
};

// GET /api/subscriptions/current
export const currentSubscription = async (req, res) => {
  const subscription = req.user.subscription ? await Subscription.findById(req.user.subscription).populate("plan") : null;
  ok(res, { subscription, state: subscriptionState(subscription), paymentMode: paymentMode() });
};

// POST /api/subscriptions/initialize { planId, method } -> starts a payment
export const initializePayment = async (req, res) => {
  if (req.user.role === "admin") return fail(res, 403, "Admins manage plans from the admin console.");
  const mode = paymentMode();
  if (mode === "disabled") return fail(res, 503, "Payments are not configured yet.");

  const plan = await Plan.findById(req.body.planId).catch(() => null);
  const current = req.user.subscription ? await Subscription.findById(req.user.subscription) : null;
  const isCurrentPlan = current && String(current.plan) === String(plan?._id);
  if (!plan || (!plan.isActive && !isCurrentPlan)) return fail(res, 404, "This plan is not available.");

  const reference = `HB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const subscription = await Subscription.create({
    user: req.user._id,
    plan: plan._id,
    planName: plan.name,
    amount: plan.price,
    paymentReference: reference,
    paymentMethod: mode === "paystack" ? "Paystack" : String(req.body.method || "Test payment"),
    status: "pending",
    paymentStatus: "pending",
  });

  if (mode === "test") return ok(res, { mode, reference, subscriptionId: subscription.id }, "Test payment started");

  const result = await paystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: req.user.email,
      amount: Math.round(plan.price * 100), // pesewas
      currency: "GHS",
      reference,
      callback_url: `${process.env.CLIENT_URL}/agent/checkout?reference=${reference}`,
      metadata: { userId: String(req.user._id), planId: String(plan._id) },
    }),
  });
  if (!result.status) {
    subscription.paymentStatus = "failed";
    await subscription.save();
    console.error("Paystack initialize failed:", result.message);
    return fail(res, 502, "Could not start the payment. Please try again.");
  }
  ok(res, { mode, reference, authorizationUrl: result.data.authorization_url }, "Payment started");
};

// POST /api/subscriptions/verify { reference } -> the server confirms the payment itself
export const verifyPayment = async (req, res) => {
  const subscription = await Subscription.findOne({ paymentReference: req.body.reference, user: req.user._id });
  if (!subscription) return fail(res, 404, "Payment not found.");

  // Idempotent: verifying twice (e.g. a page refresh) returns the same result
  if (subscription.paymentStatus === "paid") return ok(res, await loadUser(req.user._id), "Subscription already active");

  const mode = paymentMode();
  let paid = false;
  if (mode === "paystack") {
    const result = await paystack(`/transaction/verify/${encodeURIComponent(subscription.paymentReference)}`);
    const tx = result.data;
    paid = result.status && tx?.status === "success" && tx.amount >= Math.round(subscription.amount * 100) && tx.currency === "GHS";
  } else if (mode === "test") {
    paid = req.body.simulate !== "decline"; // lets the UI demonstrate a declined payment
  }

  if (!paid) {
    subscription.paymentStatus = "failed";
    await subscription.save();
    return fail(res, 402, "Your payment was not successful. Please try again.");
  }

  await activateSubscription(subscription);
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
