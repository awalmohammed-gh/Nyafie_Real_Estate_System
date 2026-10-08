import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";
import { historySchema } from "./historySchema.js";

// pending -> payment_pending (checkout started) -> paid (Paystack verified)
//   -> confirmed (owner accepted) -> active (moved in) -> completed; cancelled at any point before completion
export const RENTAL_STATUSES = ["pending", "payment_pending", "paid", "confirmed", "active", "completed", "cancelled"];
// Statuses that take the property's dates
export const OCCUPYING_STATUSES = ["paid", "confirmed", "active"];

// A booking of a rental property. The amount is always calculated by the server
// from the property price and the dates.
const rentalSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // the agent (or admin account) from the property
    ownerType: { type: String, enum: ["admin", "agent"], required: true, index: true },
    startDate: { type: Date, required: true }, // preferred move-in date
    endDate: { type: Date, required: true },
    pricePeriod: { type: String, enum: ["total", "month", "night"], required: true },
    unitPrice: { type: Number, required: true },
    units: { type: Number, required: true }, // months, nights, or 1 for a fixed price
    fees: { type: Number, default: 0 }, // no platform fees today; kept so totals stay explicit
    amount: { type: Number, required: true },
    // Who is renting (pre-filled from the account, editable for this rental)
    contactName: { type: String, required: true, trim: true, maxlength: 120 },
    contactEmail: { type: String, required: true, trim: true, lowercase: true },
    contactPhone: { type: String, required: true, trim: true, maxlength: 30 },
    currentAddress: { type: String, default: "", trim: true, maxlength: 300 },
    occupants: { type: Number, default: 1, min: 1, max: 50 },
    notes: { type: String, default: "", maxlength: 1000 },
    status: { type: String, enum: RENTAL_STATUSES, default: "pending", index: true },
    // Latest checkout attempt (every attempt is also kept in the Payment collection)
    paymentReference: { type: String, unique: true, sparse: true },
    paymentStartedAt: { type: Date },
    paymentMethod: { type: String, default: "Paystack" },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    paidAt: { type: Date },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
    history: [historySchema],
  },
  schemaOptions
);

export default mongoose.models.Rental || mongoose.model("Rental", rentalSchema);
