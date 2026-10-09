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
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "waived"], default: "pending" },
    paidAt: { type: Date },
    cancelledAt: { type: Date },
  },
  schemaOptions
);

export default mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
