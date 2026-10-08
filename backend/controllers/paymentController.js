import mongoose from "mongoose";
import { paymentReturnUrl } from "../config/runtime.js";
import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import Property from "../models/Property.js";
import { isHotel } from "../utils/hotel.js";
import { postSystemNote } from "./chatController.js";
import { PAYMENT_HOLD, addHistory, populateRental, presentRental, quoteRental, toDay } from "./rentalController.js";
import { formatGHS } from "../utils/ownership.js";
import { notifyOwner, notifyUser } from "../utils/notify.js";
import { paymentMode, paystack, newReference, isPaystackPaid, toSubunit } from "../utils/paystack.js";
import { ok, fail } from "../utils/response.js";
import { getSettings, siteName } from "../models/Setting.js";
import { initializeHotelPayment, verifyHotelPayment } from "./hotelPaymentController.js";

const rentalResult = async (rentalId, user) => presentRental(await populateRental(Rental.findById(rentalId)), user);

// POST /api/payments/initialize { rentalId }
// Re-checks the dates, recalculates the amount on the server, then starts (or resumes) a Paystack checkout.
export const initializeRentalPayment = async (req, res) => {
  if (paymentMode() === "disabled" || !(await getSettings()).payments.rentalsEnabled) {
    return fail(res, 503, "Online rental payments are turned off right now. Please chat with the owner.");
  }

  const rental = mongoose.isValidObjectId(req.body.rentalId) ? await Rental.findOne({ _id: req.body.rentalId, customer: req.user._id }) : null;
  if (!rental) return fail(res, 404, "Rental not found.");
  if (rental.paymentStatus === "paid") return fail(res, 400, "This rental is already paid.");
  if (!["pending", "payment_pending"].includes(rental.status)) return fail(res, 400, `This rental is ${rental.status.replace("_", " ")}.`);
  if (rental.hotelId) return initializeHotelPayment(req, res, rental);

  const quote = await quoteRental({ propertyId: rental.property, startDate: toDay(rental.startDate), endDate: toDay(rental.endDate) }, req.user);
  if (quote.error) return fail(res, quote.status, quote.error);

  // Clicking Pay twice during one checkout reuses it, so the customer can't be charged twice
  const inFlight = await Payment.findOne({
    rental: rental._id,
    status: "pending",
    amount: quote.amount,
    method: "Paystack",
    createdAt: { $gt: new Date(Date.now() - PAYMENT_HOLD) },
  }).sort({ createdAt: -1 });
  if (inFlight?.authorizationUrl) {
    return ok(res, { mode: "paystack", reference: inFlight.reference, amount: inFlight.amount, authorizationUrl: inFlight.authorizationUrl || undefined }, "Payment resumed");
  }

  const reference = newReference("HBR");
  const payment = await Payment.create({
    kind: "rental",
    rental: rental._id,
    customer: req.user._id,
    property: rental.property,
    owner: rental.owner,
    ownerType: rental.ownerType,
    amount: quote.amount,
    method: "Paystack",
    reference,
  });

  rental.set({
    amount: quote.amount,
    units: quote.units,
    unitPrice: quote.property.price,
    status: "payment_pending",
    paymentReference: reference,
    paymentStartedAt: new Date(),
    paymentStatus: "pending",
    paymentMethod: payment.method,
  });
  addHistory(rental, req.user, `Checkout started (${formatGHS(quote.amount)})`);
  await rental.save();

  const clientUrl = paymentReturnUrl(req);
  const result = await paystack("/transaction/initialize", {
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
  if (!result.status) {
    payment.status = "failed";
    payment.note = "Paystack could not start the checkout";
    await payment.save();
    rental.set({ status: "pending", paymentStatus: "failed" });
    await rental.save();
    console.error("Paystack initialize failed:", result.message);
    return fail(res, 502, "Could not start the payment. Please try again.");
  }
  payment.authorizationUrl = result.data.authorization_url;
  await payment.save();
  ok(res, { mode: "paystack", reference, amount: payment.amount, authorizationUrl: result.data.authorization_url, accessCode: result.data.access_code }, "Payment started");
};

// GET /api/payments/verify/:reference -> the server confirms the transaction with Paystack itself
export const verifyPayment = async (req, res) => {
  const payment = await Payment.findOne({ reference: String(req.params.reference || ""), customer: req.user._id, kind: "rental" });
  if (!payment) return fail(res, 404, "Payment not found.");

  // Already processed (e.g. the result page was refreshed): same answer again
  if (payment.status === "paid") return ok(res, await rentalResult(payment.rental, req.user), "Rental already paid");
  if (payment.status === "duplicate") return fail(res, 409, `This payment was a duplicate. ${siteName()} will refund it; your rental is already paid.`);
  if (payment.status === "refund_required") return fail(res, 409, "Your payment was received but the booking could not be fulfilled. Contact HomeBase for your refund; do not pay again.");

  if (paymentMode() === "disabled") return fail(res, 503, "Online payments are not available right now. Please try again later.");
  const booking = await Rental.findById(payment.rental);
  if (booking?.hotelId) return verifyHotelPayment(req, res, payment, booking);
  if (booking && isHotel(await Property.findById(booking.property))) return verifyHotelPayment(req, res, payment, booking);
  const paid = await isPaystackPaid(payment.reference, payment.amount);

  if (!paid) {
    await Payment.updateOne({ _id: payment._id, status: "pending" }, { status: "failed" });
    const rental = await Rental.findOne({ _id: payment.rental, paymentStatus: { $ne: "paid" }, paymentReference: payment.reference });
    if (rental) {
      rental.set({ status: "pending", paymentStatus: "failed" });
      addHistory(rental, req.user, "Payment not completed");
      await rental.save();
    }
    return fail(res, 402, "Your payment was not completed. Your rental has not been confirmed.");
  }

  // Only one request can move this payment to "paid" (protects against double verification)
  const claimed = await Payment.findOneAndUpdate({ _id: payment._id, status: { $in: ["pending", "failed"] } }, { status: "paid", paidAt: new Date() }, { returnDocument: "after" });
  if (!claimed) return ok(res, await rentalResult(payment.rental, req.user), "Rental already paid");

  const rental = await Rental.findById(payment.rental);
  if (rental.paymentStatus === "paid") {
    // A second successful charge for the same rental: keep the record and flag it for a refund
    claimed.status = "duplicate";
    claimed.note = `Rental already paid with ${rental.paymentReference}`;
    await claimed.save();
    await notifyOwner({ ownerType: "admin" }, { critical: true, type: "payment", title: "Duplicate rental payment", message: `Payment ${claimed.reference} (${formatGHS(claimed.amount)}) needs a refund.`, path: "payments" });
    return fail(res, 409, "This rental was already paid. The duplicate payment will be refunded.");
  }
  if (claimed.amount < rental.amount) {
    claimed.note = "Paid amount is less than the current rental total";
    await claimed.save();
    await notifyOwner({ ownerType: "admin" }, { critical: true, type: "payment", title: "Rental payment needs review", message: `Payment ${claimed.reference} is less than the rental total.`, path: "payments" });
    return fail(res, 409, `Your payment was received but doesn't match your current rental total. ${siteName()} will contact you.`);
  }

  rental.set({ status: "paid", paymentStatus: "paid", paidAt: claimed.paidAt, paymentReference: claimed.reference, paymentMethod: claimed.method });
  addHistory(rental, req.user, `Paid ${formatGHS(claimed.amount)} online (${claimed.reference})`);
  const populated = await populateRental(Rental.findById(rental._id));
  if (populated.property?._id) {
    const range = `${rental.startDate.toDateString()} – ${rental.endDate.toDateString()}`;
    const conversation = await postSystemNote(populated.property, req.user._id, req.user, "customer", `Rental paid online: ${formatGHS(claimed.amount)} for ${range}. Reference ${claimed.reference}.`);
    rental.conversation = conversation._id;
  }
  await rental.save();

  const title = populated.property?.title || "the property";
  await Promise.all([
    notifyUser(req.user._id, { type: "payment", title: "Rental payment successful", message: `${formatGHS(claimed.amount)} paid for "${title}". The owner will confirm your rental.`, link: "/account/rentals" }),
    notifyOwner(rental, { type: "payment", title: "Rental payment received", message: `${rental.contactName} paid ${formatGHS(claimed.amount)} for "${title}". Confirm the rental.`, path: "rentals" }),
  ]);
  ok(res, await rentalResult(rental._id, req.user), "Rental paid");
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
