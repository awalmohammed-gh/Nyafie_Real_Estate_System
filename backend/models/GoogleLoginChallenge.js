import mongoose from "mongoose";

const schema = new mongoose.Schema({
  _id: String,
  nonce: { type: String, required: true },
  tabHash: { type: String, required: true },
  clientId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.GoogleLoginChallenge || mongoose.model("GoogleLoginChallenge", schema);
