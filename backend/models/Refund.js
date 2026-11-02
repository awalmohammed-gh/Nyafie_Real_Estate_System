import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

// One document per refund attempt for a flagged payment: rental/hotel charges (Payment) or
// agent subscriptions (Subscription). A failed attempt stays in the history and a new one
// may follow; any other attempt blocks further refunds for that transaction.
//
// Paystack refunds move through:
//   submitting   saved before the request is sent, so a double click cannot send two
//   unconfirmed  the request timed out or errored: it may or may not have been queued.
//                Never resent automatically; a refund webhook or an admin settles it.
//   pending / processing / needs-attention   accepted by Paystack, not finished
//   processed    the money left Paystack (customers may wait up to 10 business days)
//   failed       Paystack could not refund; the amount was credited back to the account
// Manual refunds (money returned outside Paystack) are recorded directly as processed.
export const REFUND_FINAL = ["processed", "failed"];

const historySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note: { type: String, default: "" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // null: Paystack or the system
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const refundSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ["payment", "subscription"], required: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null, index: true },
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription", default: null, index: true },
    reference: { type: String, required: true, index: true }, // the original Paystack transaction
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // who gets the money back
    amount: { type: Number, required: true, min: 0.01 }, // GHS, always the whole payment
    currency: { type: String, default: "GHS" },
    environment: { type: String, enum: ["test", "live"], required: true },
    method: { type: String, enum: ["Paystack", "Manual"], required: true },
    status: { type: String, enum: ["submitting", "unconfirmed", "pending", "processing", "needs-attention", "processed", "failed"], required: true, index: true },
    open: { type: Boolean, default: true }, // false once failed, so a new attempt may start
    providerRefundId: { type: String, default: null },
    externalReference: { type: String, default: "" }, // manual refunds: e.g. the mobile money transaction ID
    reason: { type: String, default: "" }, // why the payment is being refunded
    failureReason: { type: String, default: "" },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    processedAt: { type: Date },
    history: { type: [historySchema], default: [] },
    nextReconcileAt: { type: Date, default: null },
  },
  schemaOptions
);

// Defence in depth for the atomic claim on the payment record: one open refund per transaction
refundSchema.index({ reference: 1 }, { name: "one_open_refund_per_transaction", unique: true, partialFilterExpression: { open: true } });
refundSchema.index({ method: 1, status: 1, nextReconcileAt: 1, createdAt: 1 });

export default mongoose.models.Refund || mongoose.model("Refund", refundSchema);
