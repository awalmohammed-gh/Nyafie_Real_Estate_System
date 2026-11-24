import mongoose from "mongoose";
import Rental from "../models/Rental.js";
import Property from "../models/Property.js";
import User from "../models/User.js";
import { isHotel, hotelTransaction } from "./hotel.js";
import Payment from "../models/Payment.js";
import { checkPaystackTransaction, inCurrentEnvironment, paymentMode } from "./paystack.js";
import { mismatchFields, recordProviderDetails } from "./paymentAudit.js";
import { confirmRentalPayment, recordFailedRentalPayment, rentalPaymentMatchesBooking, rentalPaymentNeedsReview } from "./confirmRentalPayment.js";
import { confirmHotelPayment } from "./confirmHotelPayment.js";
import { HttpError } from "./response.js";
import { formatGHS } from "./ownership.js";
import { notifyOwner, notifyUser } from "./notify.js";
import { populateRental } from "../controllers/rentalController.js";
import { postSystemNote } from "../controllers/chatController.js";
import { sendBookingConfirmation } from "./stayBooking.js";

const notifyOutcome = async ({ rental, payment, review, hotel }, user) => {
  if (review) {
    await notifyOwner({ ownerType: "admin" }, { critical: true, type: "payment", title: review === "duplicate" ? "Duplicate rental payment" : "Rental payment needs review", message: `Payment ${payment.reference} (${formatGHS(payment.amount)}) requires a refund. ${payment.note || ""}`, path: "payments" });
    return;
  }
  if (hotel) {
    const reserved = rental.status === "confirmed"; // a pay-at-hotel reservation that was then paid online
    await notifyOwner(rental, { type: "payment", title: "Hotel booking paid", message: `${rental.contactName} paid for ${rental.roomTypeId ? `${rental.numberOfRooms} ${rental.roomName} room(s)` : "an earlier whole-hotel booking"}.${reserved ? " Nothing is due at the hotel." : " Confirm the booking."} Send the guest their receipt before the stay starts.`, path: "rentals" });
    await notifyUser(user._id, { type: "payment", title: "Hotel payment verified", message: `Your ${rental.roomName || "hotel"} payment is verified.${reserved ? " Nothing is due at the hotel." : ""} The hotel will send you a receipt.`, link: "/account/rentals" });
    // The confirmation with the booking code to show on arrival
    const booked = await populateRental(Rental.findById(rental._id));
    await sendBookingConfirmation(booked, { place: booked?.property?.title || "your hotel", paid: true });
    return;
  }
  const populated = await populateRental(Rental.findById(rental._id));
  if (populated.property?._id) {
    try {
      const range = `${rental.startDate.toDateString()} – ${rental.endDate.toDateString()}`;
      const conversation = await postSystemNote(populated.property, user._id, user, "customer", `Rental paid online: ${formatGHS(payment.amount)} for ${range}. Reference ${payment.reference}.`);
      await Rental.updateOne({ _id: rental._id }, { $set: { conversation: conversation._id } });
    } catch (error) { console.error("Rental payment chat note failed:", error.message); }
  }
  const title = populated.property?.title || "the property";
  const reserved = ["confirmed", "active"].includes(rental.status); // a pay-on-arrival reservation that was then paid online
  await Promise.all([
    notifyUser(user._id, { type: "payment", title: "Rental payment successful", message: `${formatGHS(payment.amount)} paid for "${title}".${reserved ? " Nothing is due on arrival." : " The owner will confirm your rental."}`, link: "/account/rentals" }),
    notifyOwner(rental, { type: "payment", title: "Rental payment received", message: `${rental.contactName} paid ${formatGHS(payment.amount)} for "${title}".${reserved ? " Nothing is due on arrival." : " Confirm the rental."}`, path: "rentals" }),
  ]);
};

// Identity and booking always come from stored records, never webhook metadata.
// No HTTP request/response is needed, so recovery does not depend on a login cookie.
export const processRentalPayment = async (payment, user, { successExpected = false } = {}) => {
  const rental = await Rental.findById(payment.rental);
  if (!rental) throw new HttpError(409, "Booking is missing. Contact support about your payment.");
  if (rentalPaymentMatchesBooking(payment, rental)) return { state: "paid", rental, payment, repeated: true };
  if (rentalPaymentNeedsReview(payment)) return { state: payment.status === "refunded" ? "refunded" : "review", rental, payment, review: payment.status, repeated: true };
  if (payment.status !== "paid" && paymentMode() === "disabled") throw new HttpError(503, "Online payments are not available right now. Please try again later.");
  // A key only sees its own mode: a test-mode checkout cannot be checked with the live key
  if (payment.status !== "paid" && !inCurrentEnvironment(payment)) throw new HttpError(409, "This payment was started in a different Paystack mode and can no longer be confirmed. Start a new checkout.");
  const check = payment.status === "paid" ? { status: "paid" } : await checkPaystackTransaction(payment.reference, payment.amount);
  const { status } = check;
  // A webhook may arrive before the verification API reflects the final result.
  // Keep the booking hold intact and let the caller retry.
  if (status === "pending" || (successExpected && !["paid", "mismatch"].includes(status))) return { state: "pending", rental, payment };
  const actor = user || await User.findById(payment.customer) || { _id: payment.customer, firstName: rental.contactName, role: "user" };
  if (status === "mismatch") return holdMismatchedPayment(payment, rental, check, actor);
  const hotel = Boolean(rental.hotelId) || isHotel(await Property.findById(rental.property));
  if (status !== "paid") {
    if (hotel) {
      await hotelTransaction(rental.hotelId || rental.property, async (_hotel, session) => {
        await Payment.updateOne({ _id: payment._id, status: "pending" }, { status: "failed" }, { session });
        await Rental.updateOne({ _id: rental._id, paymentStatus: { $ne: "paid" }, paymentReference: payment.reference, status: "payment_pending" }, { status: "pending", paymentStatus: "failed" }, { session });
      });
    } else await recordFailedRentalPayment(payment, actor);
    return { state: "failed", rental, payment };
  }
  const outcome = hotel ? await confirmHotelPayment(payment, actor, rental) : await confirmRentalPayment(payment._id, actor);
  outcome.hotel = hotel;
  if (!outcome.review) await recordProviderDetails(Payment, payment._id, check, payment.reference);
  if (!outcome.repeated) await notifyOutcome(outcome, actor);
  return { ...outcome, state: outcome.review ? "review" : "paid" };
};

/**
 * Paystack charged a different amount or currency than this checkout expected. The money arrived,
 * so the payment is held for an administrator to refund (Payments), the booking is not confirmed
 * and its hold is released so the guest can book again. Exactly once, even if the webhook and the
 * browser's verification race: only the call that moves the payment out of pending/failed acts.
 */
const holdMismatchedPayment = async (payment, rental, check, actor) => {
  const held = await mongoose.connection.transaction(async (session) => {
    const claimed = await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $in: ["pending", "failed"] } },
      { $set: { status: "refund_required", ...mismatchFields(check) } },
      { session, returnDocument: "after" },
    );
    if (!claimed) return null;
    await Rental.updateOne(
      { _id: rental._id, paymentReference: payment.reference, status: "payment_pending", paymentStatus: { $ne: "paid" } },
      { $set: { status: "pending", paymentStatus: "failed" }, $push: { history: { status: "pending", paymentStatus: "failed", note: "Payment amount did not match the booking; held for a refund", by: actor._id } } },
      { session },
    );
    return claimed;
  });
  if (!held) {
    const latest = await Payment.findById(payment._id);
    const state = latest.status === "paid" ? "paid" : latest.status === "refunded" ? "refunded" : rentalPaymentNeedsReview(latest) ? "review" : latest.status;
    return { state, rental, payment: latest, review: rentalPaymentNeedsReview(latest) ? latest.status : undefined, repeated: true };
  }
  await notifyOutcome({ rental, payment: held, review: "refund_required" }, actor);
  await notifyUser(payment.customer, { type: "payment", title: "Payment needs review", message: `We received a payment for ${payment.reference} that didn't match your booking total, so the booking wasn't confirmed. It will be refunded; please don't pay again.`, link: "/account/rentals" });
  return { state: "review", rental, payment: held, review: "refund_required" };
};
