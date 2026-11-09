import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

// Where a hotel's online payments are settled: a Paystack subaccount for the hotel's bank account
// or mobile money wallet. Paystack holds the full account number; only the last 4 digits are kept
// here, for display. One account per hotel and Paystack environment (test subaccounts don't exist live).
// Kept out of the Property document so listing responses and edits can never expose or change it.
const payoutAccountSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    environment: { type: String, enum: ["test", "live"], required: true },
    type: { type: String, enum: ["bank", "mobile_money"], required: true },
    bankCode: { type: String, required: true, maxlength: 40 },
    bankName: { type: String, default: "", maxlength: 120 },
    accountName: { type: String, default: "", maxlength: 160 }, // as the bank or network reports it
    accountLast4: { type: String, required: true, maxlength: 4 },
    subaccountCode: { type: String, required: true, maxlength: 60 },
    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    connectedAt: { type: Date, required: true },
  },
  schemaOptions
);

payoutAccountSchema.index({ property: 1, environment: 1 }, { unique: true });

export default mongoose.models.PayoutAccount || mongoose.model("PayoutAccount", payoutAccountSchema);
