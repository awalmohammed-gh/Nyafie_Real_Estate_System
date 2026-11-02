import mongoose from "mongoose";

// One record per customer; codes are never stored in plain text.
const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  email: String,
  codeHash: { type: String, select: false },
  expiresAt: Date,
  attempts: { type: Number, default: 0 },
  nextSendAt: { type: Date, default: () => new Date(0) },
  windowStart: { type: Date, default: () => new Date(0) },
  sendCount: { type: Number, default: 0 },
});

export default mongoose.models.EmailVerification || mongoose.model("EmailVerification", schema);
