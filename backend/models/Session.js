import mongoose from "mongoose";

const KEEP_ENDED_SECONDS = 7 * 24 * 60 * 60;

/**
 * One sign-in on one browser. The browser's cookie is a signed JWT carrying this record's id, and every
 * request checks that the record is still active (utils/sessions.js), so ending it takes effect at once.
 * The token itself is never stored, and of the visitor only a browser name and part of the address.
 */
const sessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  area: { type: String, enum: ["customer", "agent", "admin"], required: true },
  startedWith: { type: String, enum: ["password", "google", "code", "customer"], default: "password" }, // customer: opened from their customer account
  device: { type: String, default: "", maxlength: 80 }, // "Chrome on Windows"
  ip: { type: String, default: "", maxlength: 40 }, // shortened: "102.176.x.x"
  createdAt: { type: Date, required: true },
  lastUsedAt: { type: Date, required: true }, // updated at most every few minutes
  expiresAt: { type: Date, required: true }, // fixed: using the session doesn't extend it
  endedAt: { type: Date, default: null },
  endReason: { type: String, enum: ["signed_out", "signed_out_elsewhere", "replaced", "too_many", "password", "email", "suspended", "removed", "security", "admin"], default: undefined },
}, { versionKey: false });

// A person's sessions, newest use first; and MongoDB deletes them a week after they expire
sessionSchema.index({ user: 1, lastUsedAt: -1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: KEEP_ENDED_SECONDS });

export default mongoose.models.Session || mongoose.model("Session", sessionSchema);
