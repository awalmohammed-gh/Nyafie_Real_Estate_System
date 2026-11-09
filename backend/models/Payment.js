import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

// Every payment attempt or confirmation for a property transaction:
//  - rental: online Paystack checkouts (one record per attempt)
//  - sale:   payments made at the office and confirmed by the owner
// Agent subscription payments stay in the Subscription collection.
const paymentSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["rental", "sale"], required: true, index: true },
    rental: { type: mongoose.Schema.Types.ObjectId, ref: "Rental", index: true },
    saleRequest: { type: mongoose.Schema.Types.ObjectId, ref: "SaleRequest", index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ownerType: { type: String, enum: ["admin", "agent"], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "GHS" },
    method: { type: String, enum: ["Paystack", "Test payment", "Office"], required: true },
    reference: { type: String, required: true, unique: true },
    // duplicate: a second successful charge for something already paid (needs a refund)
    // refunded: the whole amount went back to the customer (see the Refund ledger)
    status: { type: String, enum: ["pending", "paid", "failed", "duplicate", "refund_required", "refunded"], default: "pending", index: true },
    environment: { type: String, enum: ["test", "live", null], default: null }, // Paystack mode at checkout; null = before modes were stored (test)
    subaccount: { type: String, default: null }, // hotel bookings: the hotel's Paystack subaccount that received the money
    authorizationUrl: { type: String, default: "" }, // reused if the customer clicks Pay again during the same checkout
    // From Paystack's Verify Transaction API once confirmed (audit and reconciliation)
    providerTransactionId: { type: String, default: undefined },
    channel: { type: String, default: undefined }, // card, mobile_money, bank, ...
    paidAmount: { type: Number, default: undefined }, // GHS Paystack charged, recorded when it differs from the expected amount
    paidAt: { type: Date },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // office payments
    note: { type: String, default: "" },
    nextReconcileAt: { type: Date, default: null },
    refund: { type: mongoose.Schema.Types.ObjectId, ref: "Refund", default: null }, // the latest refund attempt
    refundStatus: { type: String, default: null }, // mirrors that refund; claims one refund at a time
  },
  schemaOptions
);

paymentSchema.index({ kind: 1, method: 1, status: 1, nextReconcileAt: 1, createdAt: 1 });
// A Paystack transaction can be recorded against one payment only
paymentSchema.index({ providerTransactionId: 1 }, { unique: true, partialFilterExpression: { providerTransactionId: { $type: "string" } } });

export default mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
