import mongoose from "mongoose";

const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  email: String,
  sessionVersion: { type: String, default: "", select: false },
  codeHash: { type: String, select: false },
  expiresAt: Date,
  attempts: { type: Number, default: 0 },
  nextSendAt: { type: Date, default: () => new Date(0) },
  windowStart: { type: Date, default: () => new Date(0) },
  sendCount: { type: Number, default: 0 },
});

export default mongoose.models.PasswordReset || mongoose.model("PasswordReset", schema);
