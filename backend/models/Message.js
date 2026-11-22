import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

export const MAX_MESSAGE_LENGTH = 2000;

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // always the signed-in account
    message: { type: String, required: true, trim: true, maxlength: MAX_MESSAGE_LENGTH },
    read: { type: Boolean, default: false },
  },
  schemaOptions
);

// A conversation's messages in order (the chat thread polls this)
messageSchema.index({ conversation: 1, createdAt: 1 });

export default mongoose.models.Message || mongoose.model("Message", messageSchema);
