import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

// A chat between a customer and the owner of one property.
// ownerType "admin" conversations are shared by all admins; a future "support"
// type (platform help desk) can be added without changing the rest of the system.
const conversationSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // property owner account
    ownerType: { type: String, enum: ["admin", "agent"], required: true, index: true },
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

export default mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
