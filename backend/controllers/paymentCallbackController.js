import Payment from "../models/Payment.js";
import Subscription from "../models/Subscription.js";
import Refund from "../models/Refund.js";
import { handleRefundWebhook, reconcileRefund } from "../utils/refunds.js";
import { processRentalPayment } from "../utils/rentalPaymentProcessing.js";
import { processSubscriptionPayment, recoverableSubscriptionPayments } from "./subscriptionController.js";
import { paymentEnvironment, paymentMode, providerScope } from "../utils/paystack.js";
import { fail, ok } from "../utils/response.js";
import { sendRenewalReminders } from "../utils/subscriptionReminders.js";
import { reportError } from "../utils/monitoring.js";
import { checkListingFreshness } from "../utils/listingFreshness.js";
import { releasePastViewings, sendViewingReminders } from "../utils/viewings.js";
import { cleanUpOldRecords } from "../utils/housekeeping.js";
import { expireUnansweredBookings } from "../utils/bookingExpiry.js";
import { cleanUpAbandonedVideos } from "../utils/listingMedia.js";

// The rental ledger or the agent subscription history: whichever stored record owns the reference
const callbackRecord = async (reference) => {
  const payment = await Payment.findOne({ reference, kind: "rental", method: "Paystack" });
  if (payment) return () => processRentalPayment(payment, undefined, { successExpected: true });
  const subscription = await Subscription.findOne({ paymentReference: reference, paymentMethod: "Paystack" });
  if (subscription) return () => processSubscriptionPayment(subscription, { successExpected: true });
  return null;
};

// This handler runs only after the exact raw body passes signature validation.
export const paystackWebhook = async (req, res) => {
  let event;
  try { event = JSON.parse(req.body.toString("utf8")); }
  catch { return fail(res, 400, "Invalid payment callback payload."); }
  // Refund progress (refund.pending, .processing, .needs-attention, .processed, .failed)
  if (typeof event?.event === "string" && event.event.startsWith("refund.")) return ok(res, await handleRefundWebhook(event.data));
  if (event?.event !== "charge.success") return ok(res, { ignored: true });
  const reference = event.data?.reference;
  if (typeof reference !== "string" || !reference.trim() || reference.length > 100) return fail(res, 400, "Invalid payment reference.");
  // Sale events are outside both ledgers. Never create records from a callback or
  // accept its customer, rental/plan ID, amount or payment status.
  const handle = await callbackRecord(reference);
  if (!handle) return ok(res, { ignored: true });
  const outcome = await handle();
  if (outcome.state === "pending") return fail(res, 503, "Payment confirmation is not ready. Retry this callback.");
  // Acknowledge only after a durable paid/refund-review outcome. Failures propagate
  // as non-200 responses so Paystack retries instead of losing the event.
  return ok(res, { processed: true });
};

const DAY = 24 * 60 * 60 * 1000;
const RECOVERY_LEASE = 10 * 60 * 1000;
const RECOVERY_BATCH = 20;

// Each queue atomically claims its next due record with a lease, so two scheduled
// invocations never check the same record concurrently.
const recoveryQueues = [
  {
    name: "rentals",
    claim: (now, lease) => Payment.findOneAndUpdate({
      kind: "rental", method: "Paystack",
      $and: [
        providerScope(),
        { $or: [{ status: "pending" }, { status: "failed", createdAt: { $gte: new Date(now.getTime() - 7 * DAY) } }] },
        { $or: [{ nextReconcileAt: null }, { nextReconcileAt: { $lte: now } }] },
      ],
    }, lease, { returnDocument: "after" }).sort({ nextReconcileAt: 1, createdAt: 1 }),
    process: (payment) => processRentalPayment(payment),
    reference: (payment) => payment.reference,
  },
  {
    name: "subscriptions",
    claim: (now, lease) => Subscription.findOneAndUpdate({
      $and: [
        recoverableSubscriptionPayments(now),
        { $or: [{ nextReconcileAt: null }, { nextReconcileAt: { $lte: now } }] },
      ],
    }, lease, { returnDocument: "after" }).sort({ nextReconcileAt: 1, createdAt: 1 }),
    process: (subscription) => processSubscriptionPayment(subscription),
    reference: (subscription) => subscription.paymentReference,
  },
  {
    // Refunds Paystack accepted but has not finished. Ones it never confirmed have no ID to
    // ask about: their webhook or an admin settles them, and they are never resent.
    name: "refunds",
    claim: (now, lease) => Refund.findOneAndUpdate({
      method: "Paystack", environment: paymentEnvironment(), providerRefundId: { $ne: null },
      status: { $in: ["unconfirmed", "pending", "processing", "needs-attention"] },
      $or: [{ nextReconcileAt: null }, { nextReconcileAt: { $lte: now } }],
    }, lease, { returnDocument: "after" }).sort({ nextReconcileAt: 1, createdAt: 1 }),
    process: (refund) => reconcileRefund(refund),
    reference: (refund) => `refund of ${refund.reference}`,
  },
];

const emptyCounts = () => ({ checked: 0, paid: 0, review: 0, pending: 0, failed: 0, errors: 0 });

export const reconcilePayments = async (req, res) => {
  res.set("Cache-Control", "no-store");
  // The same daily job reminds agents before their plan expires (works without Paystack too)
  let reminders = 0;
  try { reminders = await sendRenewalReminders(); }
  catch (error) { console.error("Renewal reminders failed:", error.message); await reportError(error, { tags: { job: "renewal-reminders" } }); }
  // ...and keeps listings fresh: reminds owners, hides listings nobody confirmed (no Paystack needed)
  let freshness = { reminded: 0, hidden: 0 };
  try { freshness = await checkListingFreshness(); }
  catch (error) { console.error("Listing freshness check failed:", error.message); await reportError(error, { tags: { job: "listing-freshness" } }); }
  // ...and tidies records that would otherwise grow forever (old notifications, expired invites)
  let cleanup = null;
  try { cleanup = await cleanUpOldRecords(); }
  catch (error) { console.error("Housekeeping failed:", error.message); await reportError(error, { tags: { job: "housekeeping" } }); }
  // ...and deletes listing videos uploaded over a day ago that no listing was saved with
  try { cleanup = { ...cleanup, abandonedVideos: await cleanUpAbandonedVideos() }; }
  catch (error) { console.error("Abandoned video clean-up failed:", error.message); await reportError(error, { tags: { job: "abandoned-videos" } }); }
  // ...and reminds both sides of viewings today or tomorrow, expiring requests nobody answered in time
  let viewings = { reminded: 0, expired: 0 };
  try { viewings = { expired: await releasePastViewings(), reminded: await sendViewingReminders() }; }
  catch (error) { console.error("Viewing reminders failed:", error.message); await reportError(error, { tags: { job: "viewing-reminders" } }); }
  // ...and cancels hotel bookings the hotel didn't approve by 24 hours before check-in (never throws)
  const unansweredBookings = await expireUnansweredBookings();
  if (paymentMode() === "disabled") return fail(res, 503, "Online payments are not configured.");
  const counts = { ...emptyCounts(), ...Object.fromEntries(recoveryQueues.map((queue) => [queue.name, emptyCounts()])) };
  // Bounded work fits one serverless invocation. The queues take turns from one shared
  // budget, so a backlog in one (rentals, subscriptions or refunds) cannot starve the others.
  let open = recoveryQueues;
  while (counts.checked < RECOVERY_BATCH && open.length) {
    for (const queue of open) {
      if (counts.checked >= RECOVERY_BATCH) break;
      const now = new Date();
      const record = await queue.claim(now, { $set: { nextReconcileAt: new Date(now.getTime() + RECOVERY_LEASE) } });
      if (!record) { open = open.filter((other) => other !== queue); continue; }
      const tally = (key) => { counts[key] = (counts[key] || 0) + 1; counts[queue.name][key] = (counts[queue.name][key] || 0) + 1; };
      tally("checked");
      try {
        tally((await queue.process(record)).state);
      } catch (error) {
        tally("errors");
        console.error(`Payment recovery failed for ${queue.reference(record)}:`, error.message);
        await reportError(error, { tags: { job: "payment-recovery", queue: queue.name } });
      }
    }
  }
  return res.status(counts.errors ? 503 : 200).json({ success: counts.errors === 0, data: { ...counts, reminders, freshness, cleanup, viewings, unansweredBookings }, message: counts.errors ? "Some payments could not be checked. Retry after the recovery lease expires." : "Payment recovery completed" });
};
