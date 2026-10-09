import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

const inquirySchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // null for guests
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true }, // owner when an agent
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true }, // agency staff member handling it (null: the owner)
    ownerType: { type: String, enum: ["admin", "agent"], required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: "", trim: true },
    message: { type: String, required: true, maxlength: 2000 },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", default: null },
    status: { type: String, enum: ["new", "contacted", "inProgress", "closed"], default: "new" },
  },
  schemaOptions
);

export default mongoose.models.Inquiry || mongoose.model("Inquiry", inquirySchema);
