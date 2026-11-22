import mongoose from "mongoose";
import { setAuthCookie } from "../utils/generateToken.js";
import { paymentReturnUrl } from "../config/runtime.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import { loadUser } from "./authController.js";
import { subscriptionState } from "../utils/permissions.js";
import { quotePlan, presentQuote, upgradeOptions } from "../utils/planChange.js";
import { ok, fail, HttpError } from "../utils/response.js";
import { paymentMode as paystackMode, paystack, newReference, checkPaystackTransaction, paymentEnvironment, inCurrentEnvironment, providerScope, toSubunit } from "../utils/paystack.js";
import { getSettings, siteName } from "../models/Setting.js";
import { notifyAdmins, notifyUser } from "../utils/notify.js";
import { formatGHS } from "../utils/ownership.js";
import { submitReadyApplication } from "./agentApplicationController.js";
import { mismatchFields, recordProviderDetails } from "../utils/paymentAudit.js";

// Subscription payments need Paystack and the admin's "subscription payments" switch
const paymentMode = async () => {
  const settings = await getSettings();
  return paystackMode() === "paystack" && settings.agent.requireSubscription && settings.payments.subscriptionsEnabled ? "paystack" : "disabled";
};

const freeAccessMessage = "Agent subscriptions are switched off. Complete your profile and professional proof for admin approval; no payment is required.";

const DAY = 24 * 60 * 60 * 1000;
// Failed checkouts are re-checked with Paystack for this long (abandoned ones can still be
// completed); processing ones stay eligible until Paystack settles them. Matches rentals.
const FAILED_RECHECK_WINDOW = 7 * DAY;

// Unsettled Paystack checkouts that onboarding and scheduled recovery may re-check
export const recoverableSubscriptionPayments = (now = new Date()) => ({
  paymentMethod: "Paystack",
  $and: [
    { $or: [{ paymentStatus: "pending" }, { paymentStatus: "failed", createdAt: { $gte: new Date(now.getTime() - FAILED_RECHECK_WINDOW) } }] },
    providerScope("paymentMethod"),
  ],
});

// Activated, waived, or paid but held for a refund: Paystack is never asked about it again
const isSettled = (subscription) => ["paid", "waived", "refund_required", "refunded"].includes(subscription?.paymentStatus);
const settledState = (subscription) => ({ refund_required: "review", refunded: "refunded" })[subscription.paymentStatus] || "paid";

// Returns the settled record when another verifier finished first, otherwise null
const saveUnconfirmedStatus = async (subscription, status) => {
  subscription.paymentStatus = status;
  try { await subscription.save(); return null; }
  catch (error) {
    if (error.name !== "VersionError") throw error;
    // A slow pending/failed provider response must not overwrite an activation
    // committed by another verifier while this request was waiting.
    const latest = await Subscription.findById(subscription._id);
    if (isSettled(latest)) return latest;
    throw new HttpError(409, "This subscription changed. Refresh it before trying again.");
  }
};

const alreadyConfirmed = async (req, res) => {
  const user = await User.findById(req.user._id);
  await submitReadyApplication(user);
  if (req.user.role === "agent") setAuthCookie(res, req.user._id, "agent", req.user.sessionVersion);
  return ok(res, await loadUser(req.user._id), "Payment already confirmed. Agent approval remains a separate requirement.");
};

/**
 * Activates a paid subscription without changing approval. The server calculates the dates:
 * renewing the same active plan extends it, anything else (a new plan or an upgrade) starts
 * today and replaces the previous plan, which stays in the history as cancelled. Listings,
 * team members and usage are untouched; the new plan's limits apply from now on.
 * A stale checkout (see below) is recorded as paid money awaiting a refund instead.
 * Returns { user, record, flagged } where `flagged` means this call marked it for a refund.
 */
const settleSubscription = async (subscription, extra = {}, { create = null } = {}) => {
  // Always reload inside the transaction: request objects can predate another
  // verification. MongoDB retries conflicting writes using a fresh snapshot.
  const result = await mongoose.connection.transaction(async (session) => {
    // A plan granted without a checkout is created here, so it never exists unless it is also activated
    if (create) await Subscription.create([create], { session });
    const record = await Subscription.findById(subscription._id).session(session);
    if (!record) throw new Error("Subscription not found.");
    const holder = await User.findById(record.user).session(session);
    if (!holder || holder.role !== "agent") throw new Error("An agent account is required.");
    if (record.activationProcessedAt) return { holder, record };
    // Older settled records already granted their period. Reverification must
    // not revive a cancelled plan or extend a period a second time.
    if (["paid", "waived"].includes(record.paymentStatus) && record.startDate && record.expiresAt && record.status !== "pending") {
      record.activationProcessedAt = record.paidAt || record.startDate;
      await record.save({ session });
      return { holder, record };
    }
    const now = new Date();
    if (holder.agentApplication?.status === "removed") {
      record.paymentStatus = extra.paymentStatus || "paid";
      record.paidAt ||= now;
      record.activationProcessedAt = now;
      await record.save({ session });
      return { holder, record };
    }
    const plan = await Plan.findById(record.plan).session(session);
    if (!plan) throw new Error("A valid plan is required.");
    const duration = record.durationDays ?? plan.duration;
    if (!Number.isFinite(duration) || duration < 1) throw new Error("Subscription duration is invalid.");
    const current = holder.subscription ? await Subscription.findById(holder.subscription._id || holder.subscription).session(session) : null;
    const different = current && !current._id.equals(record._id);
    const currentActive = different && subscriptionState(current).isActive;
    const renewing = currentActive && String(current.plan?._id || current.plan) === String(plan._id);
    // A checkout started before the current plan was activated was priced against an older
    // plan. Replacing the newer plan, or reusing an upgrade credit on a renewal, would make the
    // agent pay twice, so the money is held for a refund and the account is left as it is.
    // Full-price renewals of the same plan still stack: every paid period is granted.
    const currentSince = currentActive && (current.activationProcessedAt || current.paidAt || current.startDate);
    if (currentSince && currentSince > record.createdAt && (!renewing || record.credit > 0)) {
      record.set({ paymentStatus: "refund_required", status: "cancelled", paidAt: record.paidAt || now, cancelledAt: now, activationProcessedAt: now, note: `Paid after ${current.planName} became the current plan` });
      await record.save({ session });
      return { holder, record, flagged: true };
    }
    const base = renewing ? new Date(current.expiresAt) : now;
    record.startDate = renewing ? current.startDate : now;
    record.expiresAt = new Date(base.getTime() + duration * DAY);
    record.status = "active";
    record.accountType = plan.accountType;
    record.planPrice ??= plan.price;
    record.durationDays = duration;
    record.paymentStatus = extra.paymentStatus || "paid";
    record.paidAt ||= now;
    record.activationProcessedAt = now;
    if (different) record.previousSubscription = current._id;
    await record.save({ session });
    if (different && current.status === "active") {
      current.status = renewing ? "expired" : "cancelled";
      await current.save({ session });
    }
    holder.subscription = record._id;
    if (plan.accountType === "agency" && holder.agentApplication?.agentType !== "agency") holder.agentApplication.agentType = "agency";
    await holder.save({ session });
    return { holder, record };
  });
  // Application submission/notifications happen only after a successful commit.
  await submitReadyApplication(result.holder);
  if (result.flagged) {
    const { record } = result;
    await Promise.all([
      notifyAdmins({ critical: true, type: "payment", title: "Subscription payment needs review", message: `Payment ${record.paymentReference} (${formatGHS(record.amount)}) for ${record.planName} requires a refund. ${record.note}`, link: "/admin/payments" }),
      notifyUser(record.user, { type: "payment", title: "Subscription payment will be refunded", message: `We received ${formatGHS(record.amount)} for ${record.planName}, but a newer plan was already active, so your current plan was kept. ${siteName()} will refund this payment.`, link: "/agent/subscription" }),
    ]);
  }
  return { user: result.holder, record: result.record, flagged: Boolean(result.flagged) };
};

export const activateSubscription = async (subscription, extra = {}) => (await settleSubscription(subscription, extra)).user;

// Creates and activates a subscription in one transaction (plans an admin grants): if activation
// fails, no half-made subscription is left behind
export const createAndActivateSubscription = async (fields, extra = {}) => {
  const _id = new mongoose.Types.ObjectId();
  return (await settleSubscription({ _id }, extra, { create: { ...fields, _id } })).user;
};

/**
 * Asks Paystack about one checkout and records the answer. Shared by browser verification,
 * signed webhooks, onboarding and scheduled recovery, so a closed payment tab is handled
 * exactly like a completed return. Identity, plan and amount come from the stored record,
 * never from the provider payload; only Paystack's answer can activate a subscription.
 * Returns { state: "paid" | "review" | "pending" | "failed", repeated?, user? }; "review"
 * means the money was received but is held for a refund.
 */
export const processSubscriptionPayment = async (subscription, { successExpected = false } = {}) => {
  if (isSettled(subscription)) return { state: settledState(subscription), subscription, repeated: true };
  if (paystackMode() === "disabled") throw new HttpError(503, "Payments are not configured yet.");
  // A key only sees its own mode: a test-mode checkout cannot be checked with the live key
  if (!inCurrentEnvironment(subscription)) throw new HttpError(409, "This payment was started in a different Paystack mode and can no longer be confirmed. Start a new checkout.");
  const check = await checkPaystackTransaction(subscription.paymentReference, subscription.amount);
  const { status } = check;
  if (status === "paid") {
    const { user, record } = await settleSubscription(subscription);
    if (record.paymentStatus === "paid") await recordProviderDetails(Subscription, record._id, check, record.paymentReference);
    return { state: settledState(record), subscription: record, user };
  }
  if (status === "mismatch") return holdMismatchedSubscription(subscription, check);
  // A webhook may arrive before the verification API reflects the final result: let it retry
  if (successExpected) return { state: "pending", subscription };
  const settled = status !== subscription.paymentStatus && await saveUnconfirmedStatus(subscription, status);
  if (settled) return { state: settledState(settled), subscription: settled, repeated: true };
  return { state: status, subscription };
};

/**
 * Paystack charged a different amount or currency than this checkout expected: nothing is
 * activated, and the money is held for an administrator to refund. Atomic and versioned, so a
 * concurrent verifier either settles first (and this returns its result) or sees this outcome.
 */
const holdMismatchedSubscription = async (subscription, check) => {
  const now = new Date();
  const held = await Subscription.findOneAndUpdate(
    { _id: subscription._id, paymentStatus: { $in: ["pending", "failed"] }, activationProcessedAt: null },
    { $set: { paymentStatus: "refund_required", status: "cancelled", cancelledAt: now, activationProcessedAt: now, ...mismatchFields(check, now) }, $inc: { __v: 1 } },
    { returnDocument: "after" },
  );
  if (!held) {
    const latest = await Subscription.findById(subscription._id);
    return { state: isSettled(latest) ? settledState(latest) : latest.paymentStatus, subscription: latest, repeated: true };
  }
  await Promise.all([
    notifyAdmins({ critical: true, type: "payment", title: "Subscription payment needs review", message: `Payment ${held.paymentReference} for ${held.planName} requires a refund. ${held.note}`, link: "/admin/payments" }),
    notifyUser(held.user, { type: "payment", title: "Subscription payment will be refunded", message: `The payment we received for ${held.planName} didn't match the plan price, so nothing was activated. ${siteName()} will refund it; please don't pay again.`, link: "/agent/subscription" }),
  ]);
  return { state: "review", subscription: held };
};

// How many of an agent's unsettled checkouts one onboarding visit re-checks
const ONBOARDING_RECHECK_LIMIT = 3;

/**
 * Re-checks the agent's recent unsettled checkouts when they open onboarding, not just the
 * latest one: an agent may pay an earlier tab after starting another. Newest are settled
 * first, so if several were paid the most recent purchase is kept and the earlier ones are
 * held for a refund. Problems never block the page; the webhook and scheduled recovery
 * keep retrying.
 */
export const reconcileOpenPayments = async (user) => {
  if (paystackMode() !== "paystack") return;
  const attempts = await Subscription.find({ user: user._id, ...recoverableSubscriptionPayments() }).sort({ createdAt: -1 }).limit(ONBOARDING_RECHECK_LIMIT);
  for (const attempt of attempts) {
    try { await processSubscriptionPayment(attempt); }
    catch (error) { console.error(`Subscription payment recheck failed for ${attempt.paymentReference}:`, error.message); }
  }
};

// GET /api/subscriptions/current
export const currentSubscription = async (req, res) => {
  const subscription = req.user.subscription ? await Subscription.findById(req.user.subscription).populate("plan") : null;
  ok(res, { subscription, state: subscriptionState(subscription), paymentMode: await paymentMode() });
};

// Existing customers may pay first, then finish their profile in agent onboarding.
const checkoutBlocker = (user) => {
  if (user.role !== "agent") return [403, "Create an agent account before choosing an agent subscription."];
  if (!user.isActive || ["rejected", "suspended"].includes(user.agentApplication?.status)) return [403, "Check your agent application status before making a payment."];
  if (!user.agentApplication?.profileCompletedAt && !user.customerAccess) return [400, "Complete your agent profile before making a payment."];
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
  if (!(await getSettings()).agent.requireSubscription) return fail(res, 403, freeAccessMessage);
  const blocked = checkoutBlocker(req.user);
  if (blocked) return fail(res, ...blocked);
  const plan = await requestedPlan(req.user, req.body.planId);
  if (!plan) return fail(res, 404, "This plan is not available.");
  ok(res, presentQuote(await quotePlan(req.user, plan)));
};

// GET /api/subscriptions/upgrades -> the owner's current plan and the higher plans of their account type
export const listUpgrades = async (req, res) => {
  if (!(await getSettings()).agent.requireSubscription) return fail(res, 403, freeAccessMessage);
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
  if (!(await getSettings()).agent.requireSubscription) return fail(res, 403, freeAccessMessage);
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
    setAuthCookie(res, agent._id, "agent", req.user.sessionVersion);
    return ok(res, { mode: "credit", user: await loadUser(agent._id) }, `You're now on ${plan.name}`);
  }
  if ((await paymentMode()) === "disabled") return fail(res, 503, "Subscription payments are not available right now.");

  const reference = newReference("HB");
  const subscription = await Subscription.create({ ...record, paymentReference: reference, paymentMethod: "Paystack", environment: paymentEnvironment(), paymentStatus: "pending" });

  let result;
  try {
    result = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: req.user.email,
        amount: toSubunit(subscription.amount), // pesewas, from the stored server-side quote
        currency: "GHS",
        reference,
        callback_url: `${paymentReturnUrl(req)}${req.user.agentApplication?.status === "approved" ? "/agent/subscription/checkout" : "/agent/checkout"}?reference=${reference}`,
        metadata: { userId: String(req.user._id), planId: String(plan._id) },
      }),
    });
  } catch (error) {
    result = { status: false, message: error.message };
  }
  if (!result.status || !result.data?.authorization_url) {
    // Only if nothing settled it meanwhile; scheduled recovery still re-checks it with Paystack
    await Subscription.updateOne({ _id: subscription._id, paymentStatus: "pending" }, { $set: { paymentStatus: "failed" } });
    console.error("Paystack initialize failed:", result.message || "missing checkout URL");
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
  if (subscription.paymentStatus !== "paid" && paystackMode() === "disabled") return fail(res, 503, "Payments are not configured yet.");

  const outcome = await processSubscriptionPayment(subscription);
  if (outcome.state === "review") {
    const why = /^Paystack reported/.test(outcome.subscription?.note || "") ? "the amount didn't match the plan price, so nothing was activated" : "a newer plan was already active, so your current plan was kept";
    return fail(res, 409, `Your payment was received, but ${why}. Contact ${siteName()} for your refund; do not pay again.`);
  }
  if (outcome.state === "refunded") return fail(res, 409, "This payment has been refunded. Choose a plan again if you still need one.");
  // Idempotent: verifying twice (e.g. a page refresh, or after a webhook) returns the same result
  if (outcome.repeated) return alreadyConfirmed(req, res);
  // Still processing (e.g. a mobile money prompt): nothing is activated until Paystack confirms
  if (outcome.state === "pending") {
    return ok(res, { paymentPending: true, reference: subscription.paymentReference }, "We are waiting for confirmation of your subscription payment.", 202);
  }
  if (outcome.state === "failed") {
    return fail(res, 402, "Your payment was not completed. Your account and profile are saved, so you can try again.");
  }

  const agent = outcome.user;
  setAuthCookie(res, agent._id, "agent", req.user.sessionVersion);
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
