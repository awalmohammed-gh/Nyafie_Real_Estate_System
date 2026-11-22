import mongoose from "mongoose";

/**
 * A sign-up waiting for its email code (utils/registration.js). The account itself is created only
 * once the code is entered, so unverified people never get an account, a session or an admin notice.
 * One per email address: signing up again replaces the details. Removed automatically 24 hours after
 * the last sign-up attempt if the code is never entered.
 * The code fields match EmailVerification's, so both share the same code rules (utils/emailVerification.js).
 */
const schema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  account: { type: String, enum: ["user", "agent"], required: true }, // customer or agent sign-up
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  phone: { type: String, default: "" },
  passwordHash: { type: String, required: true, select: false },
  // Changes whenever the details are replaced: earlier codes and verification sessions stop working
  version: { type: String, required: true },
  codeHash: { type: String, select: false },
  expiresAt: Date, // when the current code expires
  attempts: { type: Number, default: 0 },
  nextSendAt: { type: Date, default: () => new Date(0) },
  windowStart: { type: Date, default: () => new Date(0) },
  sendCount: { type: Number, default: 0 },
  deleteAt: { type: Date, required: true },
}, { timestamps: true });

schema.index({ email: 1 }, { unique: true });
schema.index({ deleteAt: 1 }, { expireAfterSeconds: 0 }); // MongoDB removes unfinished sign-ups

export default mongoose.models.PendingRegistration || mongoose.model("PendingRegistration", schema);
