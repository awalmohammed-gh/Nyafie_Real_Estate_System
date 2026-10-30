import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import Rental from "../models/Rental.js";
import { HttpError } from "./response.js";
import { addHistory } from "../controllers/rentalController.js";
import { formatGHS } from "./ownership.js";
import { hasRentalConflict, lockRentalProperty } from "./rentalAvailability.js";

export const rentalPaymentNeedsReview = (payment) => ["duplicate", "refund_required"].includes(payment.status);

export const rentalPaymentMatchesBooking = (payment, rental) =>
  payment.status === "paid" && rental.paymentStatus === "paid" && rental.paymentReference === payment.reference;

const paymentReviewForRental = (payment, rental) => {
  if (rental.paymentStatus === "paid" && rental.paymentReference !== payment.reference) {
    return { status: "duplicate", note: `Rental already paid with ${rental.paymentReference}` };
  }
  if (rental.status === "cancelled") {
    return { status: "refund_required", note: "Payment arrived after this rental was cancelled" };
  }
  if (payment.amount < rental.amount) {
    return { status: "refund_required", note: "Paid amount is less than the current rental total" };
  }
  return null;
};

// Used for both checkout-start failures and failed verification. Apply the state
// guard in MongoDB so a cancellation or completed payment cannot be overwritten.
export const recordFailedRentalPayment = async (payment, user, note) => {
  await Payment.updateOne(
    { _id: payment._id, status: "pending" },
    { $set: { status: "failed", ...(note ? { note } : {}) } },
  );
  await Rental.updateOne(
    { _id: payment.rental, status: { $in: ["pending", "payment_pending"] }, paymentStatus: { $ne: "paid" }, paymentReference: payment.reference },
    {
      $set: { status: "pending", paymentStatus: "failed" },
      $push: { history: { status: "pending", paymentStatus: "failed", note: note || "Payment not completed", by: user._id } },
    },
  );
};

// Provider verification happens before this function. Commit the payment and booking
// together; a failed booking save must leave the payment retryable too.
export const confirmRentalPayment = (paymentId, user) => mongoose.connection.transaction(async (session) => {
  const payment = await Payment.findById(paymentId).session(session);
  if (!payment) throw new HttpError(404, "Payment not found.");
  if (rentalPaymentNeedsReview(payment)) return { review: payment.status, payment, repeated: true };
  const property = await lockRentalProperty(payment.property, session);
  const rental = await Rental.findById(payment.rental).session(session);
  if (!rental) throw new HttpError(409, "Booking is missing. Contact support about your payment.");
  if (rentalPaymentMatchesBooking(payment, rental)) {
    return { rental, payment, repeated: true };
  }

  payment.paidAt ||= new Date();
  let review = paymentReviewForRental(payment, rental);
  if (!review && rental.paymentStatus !== "paid") {
    if (!property || property.listingType !== "Rent" || property.availability !== "Available") {
      review = { status: "refund_required", note: "Payment arrived after this property became unavailable" };
    } else if (await hasRentalConflict(rental, { session })) {
      review = { status: "refund_required", note: "Payment arrived after these dates were reserved by another booking" };
    }
    if (review) {
      rental.status = "cancelled";
      addHistory(rental, user, "Payment received; refund required. Rental dates could not be reserved.");
      await rental.save({ session });
    }
  }
  if (review) {
    payment.set(review);
  } else {
    payment.status = "paid";
    // Also repairs an earlier interrupted confirmation whose payment was already paid.
    if (rental.paymentStatus !== "paid") {
      rental.set({ status: "paid", paymentStatus: "paid", paidAt: payment.paidAt, paymentReference: payment.reference, paymentMethod: payment.method });
      addHistory(rental, user, `Paid ${formatGHS(payment.amount)} online (${payment.reference})`);
      await rental.save({ session });
    }
  }
  // Even for an already-paid legacy record, touching this document serializes retries.
  payment.markModified("status");
  await payment.save({ session });
  return { rental, payment, ...(review ? { review: review.status } : {}) };
});
