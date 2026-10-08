import connectDB from "./mongodb.js";
import connectCloudinary from "./cloudinary.js";
import { validateRuntimeConfig } from "./runtime.js";
import { ensureAdmin } from "../utils/ensureAdmin.js";
import { checkPaystackConfig } from "../utils/paystack.js";

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
      checkPaystackConfig();
      initialized = true;
    })().finally(() => { initializing = undefined; });
  }
  return initializing;
};
