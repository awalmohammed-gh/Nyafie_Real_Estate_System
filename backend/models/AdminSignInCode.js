import mongoose from "mongoose";

// Admin two-step sign-in (controllers/adminSignInController.js): one record per admin, keyed by their
// user id, with the same code rules as email verification (utils/emailVerification.js).
// Codes are never stored in plain text.
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

export default mongoose.models.AdminSignInCode || mongoose.model("AdminSignInCode", schema);
