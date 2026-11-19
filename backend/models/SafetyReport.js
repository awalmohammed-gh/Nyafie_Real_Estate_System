import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

// Why someone reports a listing or an agent. Admins review every report; the reported side is never
// told who reported them.
export const REPORT_REASONS = Object.freeze({
  property: {
    scam: "Asks for money upfront or looks like a scam",
    unavailable: "Already sold or rented",
    wrong_details: "Wrong price, photos or location",
    duplicate: "Duplicate listing",
    offensive: "Offensive or inappropriate",
    other: "Something else",
  },
  agent: {
    scam: "Asked for money upfront or tried to scam me",
    conduct: "Rude, threatening or unprofessional",
    no_show: "Missed a viewing or stopped responding",
    impersonation: "Pretending to be someone else",
    other: "Something else",
  },
});
export const REPORT_STATUSES = ["open", "resolved", "dismissed"]; // resolved: action taken; dismissed: no problem found

const safetyReportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetType: { type: String, enum: ["property", "agent"], required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null, index: true },
    // The agent reported, or the agent who owns the reported listing (null for NyaFie's own listings)
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    ownerType: { type: String, enum: ["admin", "agent"], required: true },
    targetTitle: { type: String, required: true, maxlength: 200 }, // kept even if the listing is deleted later
    reason: { type: String, required: true },
    details: { type: String, default: "", maxlength: 1000 },
    status: { type: String, enum: REPORT_STATUSES, default: "open", index: true },
    adminNote: { type: String, default: "", maxlength: 1000 }, // internal, never shown to the reporter or the reported side
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    // Set while open: one open report per person and target, even if sent twice at once
    openKey: { type: String, default: undefined },
  },
  schemaOptions
);
safetyReportSchema.index({ openKey: 1 }, { unique: true, sparse: true });

export default mongoose.models.SafetyReport || mongoose.model("SafetyReport", safetyReportSchema);
