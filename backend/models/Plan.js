import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

// Subscription plans are the single source of truth for agent limits
const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    tagline: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    duration: { type: Number, required: true, min: 1 }, // days
    propertyLimit: { type: Number, required: true, min: 1 },
    imageLimit: { type: Number, required: true, min: 1 },
    featuredPropertyLimit: { type: Number, default: 0, min: 0 },
    analyticsLevel: { type: String, enum: ["basic", "standard", "advanced"], default: "basic" },
    inquiryManagement: { type: String, enum: ["basic", "full"], default: "basic" },
    priorityVisibility: { type: Boolean, default: false },
    features: [{ type: String, trim: true }],
    popular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  schemaOptions
);

export default mongoose.models.Plan || mongoose.model("Plan", planSchema);
