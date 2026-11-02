import mongoose from "mongoose";
import Refund, { REFUND_FINAL } from "../models/Refund.js";
import Payment from "../models/Payment.js";
import Subscription from "../models/Subscription.js";
import Rental from "../models/Rental.js";
import { siteName } from "../models/Setting.js";
import { createPaystackRefund, fetchPaystackRefund, inCurrentEnvironment, paymentMode, toSubunit } from "./paystack.js";
import { HttpError } from "./response.js";
import { formatGHS } from "./ownership.js";
import { notifyAdmins, notifyUser } from "./notify.js";
import { addHistory } from "../controllers/rentalController.js";

// Only Paystack charges that were flagged for review can be refunded, and only in full
const SOURCES = {
  payment: {
    model: Payment, statusField: "status", customerField: "customer", reference: (record) => record.reference,
    flagged: { kind: "rental", method: "Paystack", status: { $in: ["duplicate", "refund_required"] } },
    label: "rental payment",
  },
  subscription: {
    model: Subscription, statusField: "paymentStatus", customerField: "user", reference: (record) => record.paymentReference,
    flagged: { paymentMethod: "Paystack", paymentStatus: "refund_required" },
    label: "subscription payment",
  },
};

// Paystack statuses only move forward; webhooks and checks may arrive out of order
const RANK = { submitting: 0, unconfirmed: 0, pending: 1, processing: 2, "needs-attention": 2, processed: 3, failed: 3 };
// An admin may settle a request whose outcome is unknown after checking the Paystack dashboard
const UNKNOWN = ["submitting", "unconfirmed"];
const SUBMIT_GRACE = 2 * 60 * 1000;

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

const sourceOf = (refund) => SOURCES[refund.source];
const sourceId = (refund) => refund[refund.source];

// Copies a refund's state onto the payment it belongs to, inside the caller's transaction
const mirror = async (refund, by, session) => {
  const { model, statusField } = sourceOf(refund);
  const set = { refund: refund._id, refundStatus: refund.status };
  if (refund.status === "processed") set[statusField] = "refunded";
  const record = await model.findOneAndUpdate({ _id: sourceId(refund) }, { $set: set }, { session, returnDocument: "after" });
  // The booking the payment paid for shows the refund too (not for duplicate charges)
  if (refund.status === "processed" && refund.source === "payment" && record?.rental) {
    const rental = await Rental.findOne({ _id: record.rental, paymentReference: record.reference, paymentStatus: "paid" }).session(session);
    if (rental) {
      rental.paymentStatus = "refunded";
      addHistory(rental, by, `Refunded ${formatGHS(refund.amount)}${refund.method === "Manual" ? " outside Paystack" : " through Paystack"}`);
      await rental.save({ session });
    }
  }
};

const announce = async (refund) => {
  const amount = formatGHS(refund.amount);
  if (refund.status === "processed") {
    const link = refund.source === "subscription" ? "/agent/subscription" : "/account/rentals";
    const timing = refund.method === "Paystack" ? " It can take up to 10 business days to reach your account." : "";
    await notifyUser(refund.customer, { type: "payment", title: "Refund processed", message: `Your refund of ${amount} (payment ${refund.reference}) has been processed.${timing}`, link });
  } else if (refund.status === "failed") {
    await notifyAdmins({ critical: true, type: "payment", title: "Refund failed", message: `Paystack could not refund ${amount} for ${refund.reference}; the amount was returned to the balance. ${refund.failureReason}`.trim(), link: "/admin/payments" });
  } else if (refund.status === "needs-attention") {
    await notifyAdmins({ critical: true, type: "payment", title: "Refund needs attention", message: `Paystack needs action on the ${amount} refund for ${refund.reference}. Complete it in the Paystack dashboard.`, link: "/admin/payments" });
  } else if (refund.status === "unconfirmed") {
    await notifyAdmins({ critical: true, type: "payment", title: "Refund needs confirmation", message: `Paystack did not confirm the ${amount} refund for ${refund.reference}. Check the Paystack dashboard before doing anything else; do not refund it again.`, link: "/admin/payments" });
  }
};

/**
 * Moves a refund to `status` if that is a step forward, together with its payment record.
 * Final states never change. Returns the refund and whether anything changed.
 */
export const applyRefundStatus = async (refundId, status, { note = "", by = null, failureReason = "", providerRefundId = null } = {}) => {
  if (!(status in RANK)) throw new Error(`Unknown refund status: ${status}`);
  const outcome = await mongoose.connection.transaction(async (session) => {
    const refund = await Refund.findById(refundId).session(session);
    if (!refund) throw new HttpError(404, "Refund not found.");
    const advances = !REFUND_FINAL.includes(refund.status) && status !== refund.status && RANK[status] >= RANK[refund.status];
    if (!advances) {
      if (providerRefundId && !refund.providerRefundId) { refund.providerRefundId = providerRefundId; await refund.save({ session }); }
      return { refund, changed: false };
    }
    refund.status = status;
    refund.open = status !== "failed";
    refund.providerRefundId ||= providerRefundId;
    if (failureReason) refund.failureReason = failureReason.slice(0, 300);
    if (status === "processed") refund.processedAt = new Date();
    refund.history.push({ status, note: note.slice(0, 300), by: by?._id || null });
    await refund.save({ session });
    await mirror(refund, by, session);
    return { refund, changed: true };
  });
  if (outcome.changed) await announce(outcome.refund);
  return outcome;
};

/**
 * POST /api/admin/refunds. Starts a full refund of a flagged payment, either through Paystack or by
 * recording money already returned another way. The payment record is claimed in the same
 * transaction that creates the refund, so concurrent requests cannot both send one.
 */
export const requestRefund = async (admin, body = {}) => {
  const config = SOURCES[body.source];
  if (!config || !mongoose.isValidObjectId(body.id)) throw new HttpError(404, "Payment not found.");
  const method = body.method === "manual" ? "Manual" : body.method === "paystack" ? "Paystack" : null;
  if (!method) throw new HttpError(400, "Choose how the refund is made.");
  const reason = text(body.reason, 300), externalReference = text(body.externalReference, 100);
  if (method === "Manual" && (!reason || !externalReference)) throw new HttpError(400, "Enter how the money was returned and its transaction reference.");

  const record = await config.model.findOne({ _id: body.id, ...config.flagged });
  if (!record) throw new HttpError(409, "Only payments flagged for a refund can be refunded.");
  const environment = record.environment || "test";
  if (method === "Paystack") {
    if (paymentMode() === "disabled") throw new HttpError(503, "Paystack is not configured, so refunds cannot be sent.");
    if (!inCurrentEnvironment(record)) throw new HttpError(409, `This payment was made in Paystack ${environment} mode. Refund it from that Paystack dashboard, then record it as a manual refund.`);
  }

  const refundId = new mongoose.Types.ObjectId();
  const status = method === "Manual" ? "processed" : "submitting";
  const refund = await mongoose.connection.transaction(async (session) => {
    const claimed = await config.model.findOneAndUpdate(
      { _id: record._id, ...config.flagged, refundStatus: { $in: [null, "failed"] } },
      { $set: { refund: refundId, refundStatus: status } },
      { session, returnDocument: "after" },
    );
    if (!claimed) throw new HttpError(409, "A refund for this payment is already in progress or done.");
    const [created] = await Refund.create([{
      _id: refundId, source: body.source, [body.source]: record._id, reference: config.reference(record), customer: record[config.customerField],
      amount: record.amount, environment, method, status, open: true, reason, externalReference, requestedBy: admin._id,
      ...(method === "Manual" ? { processedAt: new Date() } : {}),
      history: [{ status, note: method === "Manual" ? `Recorded as refunded outside Paystack (${externalReference})` : "Refund requested", by: admin._id }],
    }], { session });
    if (method === "Manual") await mirror(created, admin, session);
    return created;
  });
  if (method === "Manual") {
    await announce(refund);
    return { refund, message: "Refund recorded." };
  }

  // The provider call runs after the commit so a transaction retry can never resend it
  let result;
  try {
    result = await createPaystackRefund(refund.reference, refund.amount, reason || `${siteName()} ${config.label} refund`);
  } catch (error) {
    const { refund: unconfirmed } = await applyRefundStatus(refund._id, "unconfirmed", { note: `No answer from Paystack: ${error.message}` });
    return { refund: unconfirmed, message: "Paystack did not answer. The refund may still have been queued: check the Paystack dashboard and do not refund it again." };
  }
  if (!result.accepted) {
    const { refund: failed } = await applyRefundStatus(refund._id, "failed", { note: "Rejected by Paystack", failureReason: result.message });
    return { refund: failed, message: `Paystack rejected the refund: ${result.message}` };
  }
  if (!result.status) {
    const { refund: unconfirmed } = await applyRefundStatus(refund._id, "unconfirmed", { note: result.message || "Paystack returned an unknown refund status", providerRefundId: result.id });
    return { refund: unconfirmed, message: result.message || "Paystack accepted the refund but its status is unclear. Check the Paystack dashboard." };
  }
  const { refund: accepted } = await applyRefundStatus(refund._id, result.status, { note: "Accepted by Paystack", providerRefundId: result.id });
  return { refund: accepted, message: "Refund sent to Paystack." };
};

/** Asks Paystack for the latest status of one accepted refund. Returns the refund's state. */
export const reconcileRefund = async (refund) => {
  if (refund.method !== "Paystack" || REFUND_FINAL.includes(refund.status) || !refund.providerRefundId) return { state: refund.status, refund };
  if (!inCurrentEnvironment(refund)) throw new HttpError(409, `This refund belongs to Paystack ${refund.environment} mode.`);
  const status = await fetchPaystackRefund(refund.providerRefundId, refund.amount);
  if (!status) return { state: refund.status, refund };
  const outcome = await applyRefundStatus(refund._id, status, { note: "Checked with Paystack" });
  return { state: outcome.refund.status, refund: outcome.refund };
};

/**
 * Handles a signed refund.* webhook. The payload only identifies the transaction, so it is matched
 * to the open refund for that reference and amount. When Paystack can be asked directly its own
 * answer wins; otherwise the signed event's status is used.
 */
export const handleRefundWebhook = async (data) => {
  const reference = data?.transaction_reference;
  if (typeof reference !== "string" || !reference.trim() || reference.length > 100) return { ignored: true };
  const refund = await Refund.findOne({ reference, method: "Paystack", open: true }).sort({ createdAt: -1 });
  // Paystack's examples send the amount as a string of pesewas; a different amount is a different refund
  if (!refund || (data.amount != null && Number(data.amount) !== toSubunit(refund.amount))) return { ignored: true };
  const status = refund.providerRefundId ? (await fetchPaystackRefund(refund.providerRefundId, refund.amount)) || data.status : data.status;
  if (!(status in RANK)) return { ignored: true };
  await applyRefundStatus(refund._id, status, { note: "Paystack refund notification" });
  return { processed: true };
};

/** An admin settles a refund whose Paystack outcome is unknown, after checking the dashboard. */
export const resolveRefund = async (admin, id, body = {}) => {
  const refund = mongoose.isValidObjectId(id) ? await Refund.findById(id) : null;
  if (!refund) throw new HttpError(404, "Refund not found.");
  if (refund.method !== "Paystack" || !UNKNOWN.includes(refund.status)) throw new HttpError(409, "Only refunds Paystack has not confirmed can be settled by hand.");
  if (refund.status === "submitting" && Date.now() - refund.createdAt.getTime() < SUBMIT_GRACE) throw new HttpError(409, "This refund is still being sent. Try again in a few minutes.");
  if (!["processed", "failed"].includes(body.outcome)) throw new HttpError(400, "Choose whether Paystack shows the refund as processed or failed.");
  const note = text(body.note, 300);
  if (!note) throw new HttpError(400, "Note what the Paystack dashboard shows.");
  const { refund: settled } = await applyRefundStatus(refund._id, body.outcome, { note: `Confirmed by an admin in the Paystack dashboard: ${note}`, by: admin, failureReason: body.outcome === "failed" ? note : "" });
  return settled;
};

/**
 * Inside a cancellation: marks the Paystack charge that paid this booking for a refund.
 * Returns the flagged payment, or null when nothing was charged online.
 */
export const flagCancelledBookingPayment = (rental, session) => Payment.findOneAndUpdate(
  { rental: rental._id, reference: rental.paymentReference, kind: "rental", method: "Paystack", status: "paid" },
  { $set: { status: "refund_required", note: "Booking cancelled after payment" } },
  { session, returnDocument: "after" },
);

export const announceCancelledBookingRefund = (payment) => notifyAdmins({
  critical: true, type: "payment", title: "Cancelled booking needs a refund",
  message: `Payment ${payment.reference} (${formatGHS(payment.amount)}) was for a booking that has been cancelled. Refund it from Payments.`,
  link: "/admin/payments",
});
