import mongoose from "mongoose";
import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import { populateRental, presentRental } from "./rentalController.js";
import { paymentMode } from "../utils/paystack.js";
import { ok, fail } from "../utils/response.js";
import { getSettings, siteName } from "../models/Setting.js";
import { initializeHotelPayment } from "./hotelPaymentController.js";
import { processRentalPayment } from "../utils/rentalPaymentProcessing.js";
import { REFUND_SUMMARY } from "./refundController.js";
import { DISPUTE_SUMMARY } from "../utils/disputes.js";

const rentalResult = async (rentalId, user) => presentRental(await populateRental(Rental.findById(rentalId)), user);

// POST /api/payments/initialize { rentalId }
// NyaFie never collects customers' money online. The one online payment left is a hotel booking at an
// agent hotel that offers it, paid straight into the hotel's own account (hotelPaymentController.js).
// Short stays are paid on arrival; rent, houses and land at the office. Payments already started
// before this rule are still verified and settled (verifyPayment, webhooks and the reconcile job).
export const initializeRentalPayment = async (req, res) => {
  const initial = mongoose.isValidObjectId(req.body.rentalId) ? await Rental.findOne({ _id: req.body.rentalId, customer: req.user._id }) : null;
  if (!initial) return fail(res, 404, "Rental not found.");
  if (!initial.hotelId) return fail(res, 409, "This booking is paid in person, never online: reserve now and pay when you arrive, or pay at the owner's office for rent.");
  if (paymentMode() === "disabled" || !(await getSettings()).payments.rentalsEnabled) {
    return fail(res, 503, "Online payments are turned off right now. Reserve now and pay at the hotel instead.");
  }
  if (initial.paymentStatus === "paid") return fail(res, 400, "This booking is already paid.");
  if (!["pending", "payment_pending"].includes(initial.status)) return fail(res, 400, `This booking is ${initial.status.replace("_", " ")}.`);
  return initializeHotelPayment(req, res, initial);
};

// GET /api/payments/verify/:reference -> the server confirms the transaction with Paystack itself
export const verifyPayment = async (req, res) => {
  const payment = await Payment.findOne({ reference: String(req.params.reference || ""), customer: req.user._id, kind: "rental" });
  if (!payment) return fail(res, 404, "Payment not found.");

  const outcome = await processRentalPayment(payment, req.user);
  if (outcome.state === "pending") {
    return res.status(409).json({
      success: false,
      code: "PAYMENT_PENDING",
      message: "Paystack is still processing this payment. Please check again shortly; do not start another payment.",
    });
  }
  if (outcome.state === "failed") return fail(res, 402, "Your payment was not completed. Your rental has not been confirmed.");
  if (outcome.state === "refunded") return fail(res, 409, "This payment has been refunded. Start a new booking if you still want this property.");
  if (outcome.state === "review") {
    const message = outcome.review === "duplicate"
      ? `This rental was already paid. Contact ${siteName()} about the duplicate payment refund; do not pay again.`
      : `Your payment was received but this booking could not be fulfilled. Contact ${siteName()} for your refund; do not pay again.`;
    return fail(res, 409, message);
  }
  return ok(res, await rentalResult(outcome.rental._id, req.user), outcome.repeated ? "Rental already paid" : "Rental paid");
};

// GET /api/admin/payments -> every rental and sale payment record
export const listPayments = async (_req, res) => {
  const payments = await Payment.find()
    .sort({ createdAt: -1 })
    .populate("customer", "firstName lastName email")
    .populate("property", "title")
    .populate("owner", "firstName lastName")
    .populate("confirmedBy", "firstName lastName")
    .populate("refund", REFUND_SUMMARY)
    .populate("dispute", DISPUTE_SUMMARY);
  ok(res, payments);
};
