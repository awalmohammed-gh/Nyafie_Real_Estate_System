import mongoose from "mongoose";

// Shared across server instances. Only a keyed hash of the normalized email is stored.
const schema = new mongoose.Schema({
  _id: String,
  failures: { type: Number, required: true },
  lockedUntil: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.LoginAttempt || mongoose.model("LoginAttempt", schema);
