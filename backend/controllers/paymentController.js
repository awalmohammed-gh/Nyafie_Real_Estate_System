import mongoose from "mongoose";
import { paymentReturnUrl } from "../config/runtime.js";
import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import { populateRental, presentRental } from "./rentalController.js";
import { paymentMode, paystack, toSubunit } from "../utils/paystack.js";
import { ok, fail } from "../utils/response.js";
import { getSettings, siteName } from "../models/Setting.js";
import { initializeHotelPayment } from "./hotelPaymentController.js";
import { recordFailedRentalPayment } from "../utils/confirmRentalPayment.js";
import { processRentalPayment } from "../utils/rentalPaymentProcessing.js";
import { prepareRentalCheckout } from "../utils/prepareRentalCheckout.js";

const rentalResult = async (rentalId, user) => presentRental(await populateRental(Rental.findById(rentalId)), user);

// POST /api/payments/initialize { rentalId }
// Re-checks the dates, recalculates the amount on the server, then starts (or resumes) a Paystack checkout.
export const initializeRentalPayment = async (req, res) => {
  if (paymentMode() === "disabled" || !(await getSettings()).payments.rentalsEnabled) {
    return fail(res, 503, "Online rental payments are turned off right now. Please chat with the owner.");
  }

  const initial = mongoose.isValidObjectId(req.body.rentalId) ? await Rental.findOne({ _id: req.body.rentalId, customer: req.user._id }) : null;
  if (!initial) return fail(res, 404, "Rental not found.");
  if (initial.paymentStatus === "paid") return fail(res, 400, "This rental is already paid.");
  if (!["pending", "payment_pending"].includes(initial.status)) return fail(res, 400, `This rental is ${initial.status.replace("_", " ")}.`);
  if (initial.hotelId) return initializeHotelPayment(req, res, initial);

  const { rental, payment, resume } = await prepareRentalCheckout(initial, req.user);
  const { reference } = payment;
  if (resume) return ok(res, { mode: "paystack", reference, amount: payment.amount, authorizationUrl: payment.authorizationUrl }, "Payment resumed");

  const clientUrl = paymentReturnUrl(req);
  let result;
  try {
    result = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: rental.contactEmail || req.user.email,
        amount: toSubunit(payment.amount),
        currency: "GHS",
        reference,
        callback_url: `${clientUrl}/payment/success?reference=${reference}`,
        metadata: { type: "rental", rentalId: rental.id, propertyId: String(rental.property), userId: String(req.user._id) },
      }),
    });
    if (!result.status || !result.data?.authorization_url) throw new Error(result.message || "Missing checkout URL");
  } catch (error) {
    await recordFailedRentalPayment(payment, req.user, "Paystack could not start the checkout");
    console.error("Paystack initialize failed:", error.message);
    return fail(res, 502, "Could not start the payment. Please try again.");
  }
  await Payment.updateOne({ _id: payment._id }, { $set: { authorizationUrl: result.data.authorization_url } });
  ok(res, { mode: "paystack", reference, amount: payment.amount, authorizationUrl: result.data.authorization_url, accessCode: result.data.access_code }, "Payment started");
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
  if (outcome.state === "review") {
    const message = outcome.review === "duplicate"
      ? `This rental was already paid. Contact ${siteName()} about the duplicate payment refund; do not pay again.`
      : `Your payment was received but this booking could not be fulfilled. Contact ${siteName()} for your refund; do not pay again.`;
    return fail(res, 409, message);
  }
  return ok(res, await rentalResult(outcome.rental._id, req.user), outcome.repeated ? "Rental already paid" : "Rental paid");
};

// GET /api/admin/payments -> every rental and office sale payment record
export const listPayments = async (_req, res) => {
  const payments = await Payment.find()
    .sort({ createdAt: -1 })
    .populate("customer", "firstName lastName email")
    .populate("property", "title")
    .populate("owner", "firstName lastName")
    .populate("confirmedBy", "firstName lastName");
  ok(res, payments);
};
