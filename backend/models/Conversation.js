import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

// A chat between a customer and the owner of one property.
// ownerType "admin" conversations are shared by all admins; a future "support"
// type (platform help desk) can be added without changing the rest of the system.
const conversationSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // property owner account
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true }, // agency staff member handling it (null: the owner)
    ownerType: { type: String, enum: ["admin", "agent"], required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
    lastSender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Unread counters for each side keep list views cheap
    customerUnread: { type: Number, default: 0 },
    ownerUnread: { type: Number, default: 0 },
    closedAt: { type: Date },
  },
  schemaOptions
);

// Inboxes: customer, agent (owner) and admin conversations, most recent message first
conversationSchema.index({ customer: 1, lastMessageAt: -1 });
conversationSchema.index({ owner: 1, lastMessageAt: -1 });
conversationSchema.index({ ownerType: 1, lastMessageAt: -1 });

export default mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
