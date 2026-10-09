import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

export const OFFER_STATUSES = ["pending", "accepted", "rejected", "countered", "withdrawn"];

// A customer's price proposal for a property that is for sale. It is only a
// proposal: it never marks the property as sold.
const offerSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // taken from the property
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true }, // agency staff member handling it (null: the owner)
    ownerType: { type: String, enum: ["admin", "agent"], required: true, index: true },
    askingPrice: { type: Number, required: true }, // property price when the offer was made
    amount: { type: Number, required: true, min: 1 },
    message: { type: String, default: "", maxlength: 1000 },
    status: { type: String, enum: OFFER_STATUSES, default: "pending", index: true },
    counterAmount: { type: Number, default: null },
    response: { type: String, default: "", maxlength: 1000 }, // owner's note when responding
    respondedAt: { type: Date },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
  },
  schemaOptions
);

export default mongoose.models.Offer || mongoose.model("Offer", offerSchema);
