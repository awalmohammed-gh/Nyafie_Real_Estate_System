import connectDB from "./mongodb.js";
import connectCloudinary from "./cloudinary.js";
import { validateRuntimeConfig } from "./runtime.js";
import { ensureAdmin } from "../utils/ensureAdmin.js";
import { checkPaystackConfig } from "../utils/paystack.js";
import { checkAdminEntryConfig } from "../utils/adminEntry.js";
import { emailConfigProblem } from "../utils/email.js";
import { reportError } from "../utils/monitoring.js";
import Setting, { clearSettingsCache } from "../models/Setting.js";
import Plan from "../models/Plan.js";

// Plans from before upgrade tiers get one, so each account type has a ladder: within a type, plans
// without a tier are ranked by listing limit, then price, above any tier the admin already set.
// Plans that have a tier are never changed; the admin manages tiers from /admin/plans.
const assignMissingTiers = async () => {
  const missing = await Plan.find({ sortOrder: { $exists: false } }).sort({ propertyLimit: 1, price: 1 });
  const next = {};
  for (const plan of missing) {
    if (next[plan.accountType] === undefined) {
      const top = await Plan.findOne({ accountType: plan.accountType, sortOrder: { $exists: true } }).sort({ sortOrder: -1 });
      next[plan.accountType] = Math.max(0, top?.sortOrder ?? 0) + 1;
    }
    await Plan.updateOne({ _id: plan._id, sortOrder: { $exists: false } }, { $set: { sortOrder: next[plan.accountType]++ } });
  }
};

let initialized = false;
let initializing;

export const initializeBackend = async () => {
  validateRuntimeConfig();
  await connectDB();
  if (initialized) return;
  if (!initializing) {
    initializing = (async () => {
      connectCloudinary();
      await ensureAdmin();
      // Existing installations gain Hotel once; later admin option changes are respected.
      await Setting.updateOne({ key: "platform", hotelRoomsVersion: { $ne: 1 } }, { $addToSet: { "property.propertyTypes": "Hotel" }, $set: { hotelRoomsVersion: 1 } });
      clearSettingsCache();
      // Plans from before account types and chat: individual plans, with chat where inquiry management is full
      // (Starter plans stay without chat). Only fills in missing fields, so admin choices are kept.
      await Plan.updateMany({ accountType: { $exists: false } }, { $set: { accountType: "individual" } });
      await Plan.updateMany({ internalChat: { $exists: false }, inquiryManagement: "full" }, { $set: { internalChat: true } });
      await Plan.updateMany({ internalChat: { $exists: false } }, { $set: { internalChat: false } });
      await assignMissingTiers();
      checkPaystackConfig();
      checkAdminEntryConfig();
      const emailProblem = emailConfigProblem();
      if (emailProblem) {
        const message = `Email is not configured, so nobody can finish signing up or reset a password. ${emailProblem}`;
        console.error(message);
        if (process.env.NODE_ENV === "production") reportError(new Error(message), { tags: { stage: "initialize", check: "email" } });
      }
      initialized = true;
    })().finally(() => { initializing = undefined; });
  }
  return initializing;
};
