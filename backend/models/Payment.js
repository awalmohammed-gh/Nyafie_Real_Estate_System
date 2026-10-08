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
    status: { type: String, enum: ["pending", "paid", "failed", "duplicate", "refund_required"], default: "pending", index: true },
    authorizationUrl: { type: String, default: "" }, // reused if the customer clicks Pay again during the same checkout
    paidAt: { type: Date },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // office payments
    note: { type: String, default: "" },
  },
  schemaOptions
);

export default mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
