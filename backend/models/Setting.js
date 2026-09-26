import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

export const defaultSettings = {
  platform: { name: "HomeBase", email: "info@homebase.com", phone: "+233 24 152 9904", currency: "GHS", location: "Airport City, Accra, Ghana" },
  property: { maxImages: 15, requireApproval: true, allowAgentPublishing: true },
  agent: { requireSubscription: true, defaultPlan: "", manualAgentVerification: false },
  notifications: { email: true, inquiries: true, subscriptions: true, weeklyDigest: false },
};

// A single settings document managed from the admin console
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "platform", unique: true },
    platform: { type: mongoose.Schema.Types.Mixed, default: () => defaultSettings.platform },
    property: { type: mongoose.Schema.Types.Mixed, default: () => defaultSettings.property },
    agent: { type: mongoose.Schema.Types.Mixed, default: () => defaultSettings.agent },
    notifications: { type: mongoose.Schema.Types.Mixed, default: () => defaultSettings.notifications },
  },
  schemaOptions
);

const Setting = mongoose.models.Setting || mongoose.model("Setting", settingSchema);

// Settings merged with defaults (creates the document on first use)
export const getSettings = async () => {
  const doc = (await Setting.findOne({ key: "platform" })) || (await Setting.create({ key: "platform" }));
  const merged = {};
  for (const section of Object.keys(defaultSettings)) {
    merged[section] = { ...defaultSettings[section], ...(doc[section] || {}) };
  }
  return merged;
};

export default Setting;
