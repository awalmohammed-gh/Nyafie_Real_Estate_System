import crypto from "node:crypto";
import { paymentMode, validPaystackSignature } from "../utils/paystack.js";
import { fail } from "../utils/response.js";

export const authenticatePaystackWebhook = (req, res, next) => {
  if (paymentMode() === "disabled") return fail(res, 503, "Payment callbacks are not configured.");
  if (!validPaystackSignature(req.body, req.get("x-paystack-signature"))) return fail(res, 401, "Invalid payment callback signature.");
  next();
};

export const authenticatePaymentRecovery = (req, res, next) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) return fail(res, 503, "Payment recovery is not configured.");
  const expected = crypto.createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = crypto.createHash("sha256").update(req.get("Authorization") || "").digest();
  if (!crypto.timingSafeEqual(expected, received)) return fail(res, 401, "Unauthorized.");
  next();
};
