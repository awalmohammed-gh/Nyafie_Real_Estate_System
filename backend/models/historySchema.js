import mongoose from "mongoose";

// One entry per change to a rental or sale request, so the full transaction history is kept
export const historySchema = new mongoose.Schema(
  {
    status: { type: String },
    paymentStatus: { type: String },
    note: { type: String, default: "" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // who made the change (customer, agent or admin)
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);
