import connectDB from "./mongodb.js";
import connectCloudinary from "./cloudinary.js";
import { validateRuntimeConfig } from "./runtime.js";
import { ensureAdmin } from "../utils/ensureAdmin.js";
import { checkPaystackConfig } from "../utils/paystack.js";
import Setting from "../models/Setting.js";

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
      checkPaystackConfig();
      initialized = true;
    })().finally(() => { initializing = undefined; });
  }
  return initializing;
};
