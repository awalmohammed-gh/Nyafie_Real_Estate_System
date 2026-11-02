import mongoose from "mongoose";
import Refund from "../models/Refund.js";
import { reconcileRefund, requestRefund, resolveRefund } from "../utils/refunds.js";
import { ok, fail } from "../utils/response.js";

// The refund fields shown next to a payment on the admin Payments page
export const REFUND_SUMMARY = "status method amount providerRefundId externalReference reason failureReason processedAt createdAt";

// GET /api/admin/refunds -> every refund attempt, newest first
export const listRefunds = async (_req, res) => {
  const refunds = await Refund.find().sort({ createdAt: -1 }).populate("customer", "firstName lastName").populate("requestedBy", "firstName lastName").populate("history.by", "firstName lastName");
  ok(res, refunds);
};

// POST /api/admin/refunds { source: "payment" | "subscription", id, method: "paystack" | "manual", reason, externalReference }
export const createRefund = async (req, res) => {
  const { refund, message } = await requestRefund(req.user, req.body);
  ok(res, refund, message, 201);
};

// POST /api/admin/refunds/:id/check -> ask Paystack for the latest status now
export const checkRefund = async (req, res) => {
  const refund = mongoose.isValidObjectId(req.params.id) ? await Refund.findById(req.params.id) : null;
  if (!refund) return fail(res, 404, "Refund not found.");
  const { refund: latest } = await reconcileRefund(refund);
  ok(res, latest, latest.providerRefundId ? "Refund status checked with Paystack." : "Paystack has not confirmed this refund yet. Check the Paystack dashboard.");
};

// POST /api/admin/refunds/:id/resolve { outcome: "processed" | "failed", note } -> after checking the Paystack dashboard
export const settleRefund = async (req, res) => ok(res, await resolveRefund(req.user, req.params.id, req.body), "Refund updated.");
