import mongoose from "mongoose";

/**
 * The receipt the receiving side (the agent, agency or hotel, or NyaFie for its own listings) gives the
 * customer for a payment: issued once, never edited. Rentals, hotel bookings and sales keep their own.
 * The customer sees it in their account and gets it by email (utils/receipts.js).
 */
export const receiptSchema = new mongoose.Schema(
  {
    number: { type: String, required: true }, // e.g. NFR-20261123-9F3A61C2 (unique per collection)
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "GHS" },
    method: { type: String, required: true, maxlength: 60 }, // "At the office", "At the hotel", "Online (Paystack)"...
    paymentReference: { type: String, default: "", maxlength: 80 }, // the ledger or Paystack reference
    note: { type: String, default: "", maxlength: 300 },
    issuedAt: { type: Date, required: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // the person who issued it
    issuedByName: { type: String, required: true, maxlength: 160 },
    business: { type: String, required: true, maxlength: 160 }, // who received the money
    businessAddress: { type: String, default: "", maxlength: 300 },
    businessPhone: { type: String, default: "", maxlength: 40 },
    customerName: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 300 }, // what was paid for
  },
  { _id: false }
);
