import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";
import { historySchema } from "./historySchema.js";

export const SALE_STATUSES = [
  "pending",
  "contacted",
  "offer_received",
  "negotiating",
  "approved",
  "payment_pending",
  "paid_at_office",
  "completed",
  "cancelled",
  "rejected",
];
export const CLOSED_SALE_STATUSES = ["completed", "cancelled", "rejected"];
// Sale payments are never made online: the buyer and the owner agree how to pay (in chat, by phone or in person)
export const SALE_PAYMENT_STATUSES = ["pending", "payment_requested", "confirmed", "failed"];

// A customer's request to buy a property ("Buy Now"). The owner contacts them,
// the customer pays the owner as agreed, and the owner confirms the payment here.
// (paid_at_office is the stored name of "payment received"; kept so existing records stay valid)
const saleRequestSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // taken from the property
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true }, // agency staff member handling it (null: the owner)
    ownerType: { type: String, enum: ["admin", "agent"], required: true, index: true },
    askingPrice: { type: Number, required: true }, // property price when the request was made
    contactName: { type: String, required: true, trim: true, maxlength: 120 },
    contactEmail: { type: String, required: true, trim: true, lowercase: true },
    contactPhone: { type: String, required: true, trim: true, maxlength: 30 },
    message: { type: String, default: "", maxlength: 1000 },
    status: { type: String, enum: SALE_STATUSES, default: "pending", index: true },
    paymentStatus: { type: String, enum: SALE_PAYMENT_STATUSES, default: "pending" },
    amountPaid: { type: Number, default: null }, // recorded when the owner confirms the payment
    paymentConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    paymentConfirmedAt: { type: Date },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
    history: [historySchema],
  },
  schemaOptions
);

export default mongoose.models.SaleRequest || mongoose.model("SaleRequest", saleRequestSchema);
