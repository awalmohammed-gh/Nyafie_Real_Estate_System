import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

// A single-use link an agency owner shares to add a staff member. Only a hash of the token is
// stored, so a database leak can't be turned into working invite links.
const teamInviteSchema = new mongoose.Schema(
  {
    agency: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // the agency owner
    role: { type: String, enum: ["manager", "agent"], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    revokedAt: { type: Date, default: null },
  },
  schemaOptions
);

export default mongoose.models.TeamInvite || mongoose.model("TeamInvite", teamInviteSchema);
