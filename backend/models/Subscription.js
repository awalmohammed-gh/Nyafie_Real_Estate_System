import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

// One document per purchase or renewal, so it doubles as the payment history
const subscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },
    planName: { type: String, required: true },
    status: { type: String, enum: ["pending", "active", "expired", "cancelled"], default: "pending", index: true },
    startDate: { type: Date },
    expiresAt: { type: Date },
    amount: { type: Number, required: true },
    paymentReference: { type: String, required: true, unique: true },
    paymentMethod: { type: String, default: "Paystack" },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "waived"], default: "pending" },
    paidAt: { type: Date },
    cancelledAt: { type: Date },
  },
  schemaOptions
);

export default mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
