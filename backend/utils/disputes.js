import mongoose from "mongoose";
import Dispute from "../models/Dispute.js";
import Payment from "../models/Payment.js";
import Subscription from "../models/Subscription.js";
import { fetchPaystackDispute, inCurrentEnvironment, paymentEnvironment, readPaystackDispute } from "./paystack.js";
import { formatGHS } from "./ownership.js";
import { notifyAdmins } from "./notify.js";

// The bank returned the payment, or still may: a Paystack refund on top could pay the customer twice
export const DISPUTE_BLOCKS_REFUND = ["open", "check", "lost"];

// The dispute fields shown next to a payment on the admin Payments page
export const DISPUTE_SUMMARY = "disputeId outcome disputedAmount lostAmount providerStatus resolution category dueAt resolvedAt createdAt";

const SOURCES = {
  payment: { model: Payment, customerField: "customer", covers: "booking", find: (reference) => Payment.findOne({ reference, kind: "rental", method: "Paystack" }) },
  subscription: { model: Subscription, customerField: "user", covers: "plan", find: (reference) => Subscription.findOne({ paymentReference: reference, paymentMethod: "Paystack" }) },
};

const REMINDER_GAP = 20 * 60 * 60 * 1000; // Paystack reminds every four hours; admins hear about once a day
const DUE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

// What Paystack charged, which is the most a dispute can take back
const chargedAmount = (record) => record.paidAmount ?? record.amount;

const OPEN_STATUSES = ["awaiting-merchant-feedback", "awaiting-bank-feedback", "pending"];
const LOST = ["merchant-accepted", "auto-accepted"];

/** open | won | lost | check, from Paystack's status and resolution. Nothing is guessed: unknown words are "check". */
export const disputeOutcome = ({ status, resolution, amount }) => {
  if (OPEN_STATUSES.includes(status)) return "open";
  if (status !== "resolved") return "check";
  if (resolution === "declined") return "won";
  // Lost for an amount NyaFie can't read (missing, another currency) is for an admin to check
  return LOST.includes(resolution) && amount ? "lost" : "check";
};

const disputedRecord = async (reference) => {
  for (const [source, config] of Object.entries(SOURCES)) {
    const record = await config.find(reference);
    if (record) return { source, record };
  }
  return null;
};

// Copies the state of all its disputes onto the payment, inside the caller's transaction. A payment
// can be disputed more than once: the dispute that still needs someone is the one shown.
const mirror = async ({ source, record }, session) => {
  const disputes = await Dispute.find({ [source]: record._id }).sort({ createdAt: -1 }).session(session);
  const shown = ["open", "check", "lost", "won"].map((outcome) => disputes.find((dispute) => dispute.outcome === outcome)).find(Boolean);
  const lost = disputes.reduce((sum, dispute) => sum + Math.round(dispute.lostAmount * 100), 0) / 100;
  await SOURCES[source].model.updateOne(
    { _id: record._id },
    { $set: { dispute: shown._id, disputeStatus: shown.outcome, disputeLost: Math.min(lost, chargedAmount(record)) } },
    { session },
  );
};

const alert = ({ dispute }, title, message) =>
  notifyAdmins({ critical: true, type: "payment", key: `dispute-${dispute._id}`, title, message, link: "/admin/payments" });

const respondBy = (dispute) => (dispute.dueAt
  ? `Answer it in the Paystack dashboard by ${DUE.format(dispute.dueAt)}, or Paystack returns the money.`
  : "Answer it in the Paystack dashboard, or Paystack returns the money.");

const announce = async (saved) => {
  const { dispute, record, source, reopened } = saved;
  const payment = `${dispute.reference} (${formatGHS(chargedAmount(record))})`;
  if (dispute.outcome === "open") {
    const refunded = record.refundStatus && record.refundStatus !== "failed";
    await alert(saved, reopened ? "Payment dispute reopened" : "Payment disputed", `Payment ${payment} was disputed. ${respondBy(dispute)} ${refunded ? "A refund of it is already recorded: use that as your evidence." : "Don't refund it separately."}`);
  } else if (dispute.outcome === "lost") {
    await alert(saved, "Payment dispute lost", `${formatGHS(dispute.lostAmount)} of payment ${payment} went back to the customer. Don't refund it again. The ${SOURCES[source].covers} it paid for was not changed: cancel it if it should end.`);
  } else if (dispute.outcome === "won") {
    await alert(saved, "Payment dispute won", `Paystack closed the dispute over payment ${payment} in your favour. Nothing else is needed.`);
  } else {
    await alert(saved, "Payment dispute needs checking", `Paystack reports the dispute over payment ${payment} as "${[dispute.providerStatus, dispute.resolution].filter(Boolean).join(", ") || "unknown"}". Check the Paystack dashboard before refunding anything.`);
  }
};

/**
 * Saves what Paystack reports about one dispute, together with its payment record. Repeated events
 * change nothing. The booking or plan the payment paid for is never touched: an admin decides that.
 * `confirmed`: the details come from Paystack's API rather than only a signed event. Events can
 * arrive late, so one that isn't confirmed may not reopen a closed dispute: returns null, to be retried.
 */
const recordDispute = async ({ source, record }, reported, { confirmed }) => {
  const outcome = disputeOutcome(reported);
  const environment = paymentEnvironment();
  const saved = await mongoose.connection.transaction(async (session) => {
    const existing = await Dispute.findOne({ environment, disputeId: reported.id }).session(session);
    const previous = existing?.outcome;
    const reopened = Boolean(previous) && previous !== "open" && outcome === "open";
    if (reopened && !confirmed) return null;
    const dispute = existing || new Dispute({
      disputeId: reported.id, environment, source, [source]: record._id, reference: reported.reference,
      customer: record[SOURCES[source].customerField], amount: record.amount, outcome,
    });
    if (previous !== outcome || dispute.providerStatus !== reported.status || dispute.resolution !== reported.resolution) {
      dispute.history.push({ outcome, providerStatus: reported.status, resolution: reported.resolution });
    }
    dispute.set({
      outcome,
      providerStatus: reported.status,
      resolution: reported.resolution,
      category: reported.category || dispute.category,
      disputedAmount: reported.amount ?? dispute.disputedAmount,
      lostAmount: outcome === "lost" ? Math.min(reported.amount, chargedAmount(record)) : 0,
      dueAt: reported.dueAt ?? dispute.dueAt,
      resolvedAt: outcome === "open" ? null : reported.resolvedAt ?? dispute.resolvedAt ?? new Date(),
    });
    await dispute.save({ session });
    await mirror({ source, record }, session);
    return { dispute, record, source, changed: previous !== outcome, reopened };
  });
  if (saved?.changed) await announce(saved);
  return saved;
};

// About once a day, while NyaFie still has to answer. Also covers an alert lost to a crash.
const remind = async (saved) => {
  const now = new Date();
  const dispute = await Dispute.findOneAndUpdate(
    { _id: saved.dispute._id, outcome: "open", providerStatus: "awaiting-merchant-feedback", $or: [{ remindedAt: null }, { remindedAt: { $lte: new Date(now.getTime() - REMINDER_GAP) } }] },
    { $set: { remindedAt: now } },
    { returnDocument: "after" },
  );
  if (dispute) await alert(saved, "Payment dispute waiting for your answer", `Payment ${dispute.reference} (${formatGHS(chargedAmount(saved.record))}) is still disputed. ${respondBy(dispute)}`);
};

/**
 * Handles a signed charge.dispute.* webhook. The event identifies the dispute and Paystack's own
 * answer about it wins. The signed event is used only when Paystack can't be asked, so one failed
 * request never hides a deadline. Disputes over anything outside NyaFie's records, or from the
 * other Paystack mode, are ignored.
 */
export const handleDisputeWebhook = async (type, data) => {
  const event = readPaystackDispute(data);
  if (!event) return { ignored: true };
  let latest = null;
  try { latest = await fetchPaystackDispute(event.id); }
  catch (error) { console.error(`Dispute ${event.id} could not be checked with Paystack:`, error.message); }
  const reported = latest || event;
  if (reported.reference !== event.reference || (reported.domain && reported.domain !== paymentEnvironment())) return { ignored: true };
  const target = await disputedRecord(reported.reference);
  if (!target || !inCurrentEnvironment(target.record)) return { ignored: true };
  const saved = await recordDispute(target, reported, { confirmed: Boolean(latest) });
  if (!saved) return { retry: true };
  if (type === "charge.dispute.remind" && !saved.changed) await remind(saved);
  return { processed: true };
};

/** Asks Paystack about one open dispute, in case the webhook about its result never arrived. */
export const reconcileDispute = async (dispute) => {
  const latest = await fetchPaystackDispute(dispute.disputeId);
  if (!latest || latest.reference !== dispute.reference) return { state: "pending" };
  const target = await disputedRecord(dispute.reference);
  if (!target) return { state: "pending" };
  const saved = await recordDispute(target, latest, { confirmed: true });
  return { state: saved.dispute.outcome === "open" ? "pending" : "review" };
};
