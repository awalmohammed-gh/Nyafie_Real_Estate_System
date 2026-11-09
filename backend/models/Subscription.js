import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";
import { ACCOUNT_TYPES } from "../utils/accountTypes.js";

// One document per purchase, renewal or upgrade, so it doubles as the payment and plan history
const subscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },
    planName: { type: String, required: true },
    accountType: { type: String, enum: ACCOUNT_TYPES, default: "individual" }, // the plan's account type when bought
    status: { type: String, enum: ["pending", "active", "expired", "cancelled"], default: "pending", index: true },
    startDate: { type: Date },
    expiresAt: { type: Date },
    amount: { type: Number, required: true }, // what was charged
    planPrice: { type: Number }, // the plan's full price for one period when bought
    durationDays: { type: Number }, // the plan's period when bought
    credit: { type: Number, default: 0 }, // unused value of the previous plan taken off an upgrade
    kind: { type: String, enum: ["new", "renewal", "upgrade", "change"], default: "new" }, // "change": plan switches from before upgrades-only
    previousPlanName: { type: String }, // the plan an upgrade replaced
    previousSubscription: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" }, // the record it replaced (set on activation)
    paymentReference: { type: String, required: true, unique: true },
    paymentMethod: { type: String, default: "Paystack" },
    // refund_required: paid after a newer plan became current; the account was left unchanged
    // refunded: the payment went back to the agent (see the Refund ledger)
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "waived", "refund_required", "refunded"], default: "pending" },
    environment: { type: String, enum: ["test", "live", null], default: null }, // Paystack mode at checkout; null = before modes were stored (test)
    note: { type: String, default: "" }, // why a payment needs review
    // From Paystack's Verify Transaction API once confirmed (audit and reconciliation)
    providerTransactionId: { type: String, default: undefined },
    channel: { type: String, default: undefined }, // card, mobile_money, bank, ...
    paidAmount: { type: Number, default: undefined }, // GHS Paystack charged, recorded when it differs from the expected amount
    renewalReminderAt: { type: Date, default: null }, // the "expires soon" notice was sent
    paidAt: { type: Date },
    activationProcessedAt: { type: Date }, // committed once with the account/plan changes
    cancelledAt: { type: Date },
    nextReconcileAt: { type: Date, default: null }, // scheduled recovery lease
    refund: { type: mongoose.Schema.Types.ObjectId, ref: "Refund", default: null }, // the latest refund attempt
    refundStatus: { type: String, default: null }, // mirrors that refund; claims one refund at a time
  },
  { ...schemaOptions, optimisticConcurrency: true }
);

subscriptionSchema.index({ paymentMethod: 1, paymentStatus: 1, nextReconcileAt: 1, createdAt: 1 });
// A Paystack transaction can be recorded against one subscription payment only
subscriptionSchema.index({ providerTransactionId: 1 }, { unique: true, partialFilterExpression: { providerTransactionId: { $type: "string" } } });
subscriptionSchema.index({ status: 1, expiresAt: 1, renewalReminderAt: 1 });

export default mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
