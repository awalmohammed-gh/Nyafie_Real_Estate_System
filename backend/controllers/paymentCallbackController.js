import Payment from "../models/Payment.js";
import { processRentalPayment } from "../utils/rentalPaymentProcessing.js";
import { paymentMode } from "../utils/paystack.js";
import { fail, ok } from "../utils/response.js";

// This handler runs only after the exact raw body passes signature validation.
export const paystackWebhook = async (req, res) => {
  let event;
  try { event = JSON.parse(req.body.toString("utf8")); }
  catch { return fail(res, 400, "Invalid payment callback payload."); }
  if (event?.event !== "charge.success") return ok(res, { ignored: true });
  const reference = event.data?.reference;
  if (typeof reference !== "string" || !reference.trim() || reference.length > 100) return fail(res, 400, "Invalid payment reference.");
  // Subscription/sale events are outside the rental ledger. Never create records
  // from a callback or accept its customer, rental ID, amount or payment status.
  const payment = await Payment.findOne({ reference, kind: "rental", method: "Paystack" });
  if (!payment) return ok(res, { ignored: true });
  const outcome = await processRentalPayment(payment, undefined, { successExpected: true });
  if (outcome.state === "pending") return fail(res, 503, "Payment confirmation is not ready. Retry this callback.");
  // Acknowledge only after a durable paid/refund-review outcome. Failures propagate
  // as non-200 responses so Paystack retries instead of losing the event.
  return ok(res, { processed: true });
};

const DAY = 24 * 60 * 60 * 1000;
const RECOVERY_LEASE = 10 * 60 * 1000;

export const reconcileRentalPayments = async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (paymentMode() === "disabled") return fail(res, 503, "Online payments are not configured.");
  const counts = { checked: 0, paid: 0, review: 0, pending: 0, failed: 0, errors: 0 };
  // Bounded work fits one serverless invocation. Database leases prevent two
  // scheduled invocations repeatedly checking the same records concurrently.
  for (let index = 0; index < 20; index++) {
    const now = new Date();
    const payment = await Payment.findOneAndUpdate({
      kind: "rental", method: "Paystack",
      $and: [
        { $or: [{ status: "pending" }, { status: "failed", createdAt: { $gte: new Date(now.getTime() - 7 * DAY) } }] },
        { $or: [{ nextReconcileAt: null }, { nextReconcileAt: { $lte: now } }] },
      ],
    }, { $set: { nextReconcileAt: new Date(now.getTime() + RECOVERY_LEASE) } }, { returnDocument: "after" }).sort({ nextReconcileAt: 1, createdAt: 1 });
    if (!payment) break;
    counts.checked += 1;
    try {
      const outcome = await processRentalPayment(payment);
      counts[outcome.state] += 1;
    } catch (error) {
      counts.errors += 1;
      console.error(`Payment recovery failed for ${payment.reference}:`, error.message);
    }
  }
  return res.status(counts.errors ? 503 : 200).json({ success: counts.errors === 0, data: counts, message: counts.errors ? "Some rental payments could not be checked. Retry after the recovery lease expires." : "Rental payment recovery completed" });
};
