import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";
import { ACCOUNT_TYPES } from "../utils/accountTypes.js";

// Subscription plans are the single source of truth for agent limits and features.
// Each plan is for one account type: individual agents, agencies or companies.
const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    tagline: { type: String, default: "" },
    accountType: { type: String, enum: ACCOUNT_TYPES, default: "individual", index: true },
    price: { type: Number, required: true, min: 0 },
    duration: { type: Number, required: true, min: 1 }, // days
    propertyLimit: { type: Number, required: true, min: 1 },
    imageLimit: { type: Number, required: true, min: 1 }, // photos per property
    featuredPropertyLimit: { type: Number, default: 0, min: 0 },
    analyticsLevel: { type: String, enum: ["basic", "standard", "advanced"], default: "basic" },
    inquiryManagement: { type: String, enum: ["basic", "full"], default: "basic" },
    internalChat: { type: Boolean, default: false },
    teamMemberLimit: { type: Number, default: 0, min: 0 }, // agency staff accounts (besides the owner) // NyaFie customer chat (inquiries, phone, email and WhatsApp always work)
    priorityVisibility: { type: Boolean, default: false },
    features: [{ type: String, trim: true }],
    popular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }, // upgrade tier within its account type: a higher tier is an upgrade (also the display order)
  },
  schemaOptions
);

export default mongoose.models.Plan || mongoose.model("Plan", planSchema);
