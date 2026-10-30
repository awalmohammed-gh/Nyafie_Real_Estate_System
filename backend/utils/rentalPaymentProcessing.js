import Rental from "../models/Rental.js";
import Property from "../models/Property.js";
import User from "../models/User.js";
import { isHotel, hotelTransaction } from "./hotel.js";
import Payment from "../models/Payment.js";
import { paymentMode, paystackPaymentStatus } from "./paystack.js";
import { confirmRentalPayment, recordFailedRentalPayment, rentalPaymentMatchesBooking, rentalPaymentNeedsReview } from "./confirmRentalPayment.js";
import { confirmHotelPayment } from "./confirmHotelPayment.js";
import { HttpError } from "./response.js";
import { formatGHS } from "./ownership.js";
import { notifyOwner, notifyUser } from "./notify.js";
import { populateRental } from "../controllers/rentalController.js";
import { postSystemNote } from "../controllers/chatController.js";

const notifyOutcome = async ({ rental, payment, review, hotel }, user) => {
  if (review) {
    await notifyOwner({ ownerType: "admin" }, { critical: true, type: "payment", title: review === "duplicate" ? "Duplicate rental payment" : "Rental payment needs review", message: `Payment ${payment.reference} (${formatGHS(payment.amount)}) requires a refund. ${payment.note || ""}`, path: "payments" });
    return;
  }
  if (hotel) {
    await notifyOwner(rental, { type: "payment", title: "Hotel booking paid", message: `${rental.contactName} paid for ${rental.roomTypeId ? `${rental.numberOfRooms} ${rental.roomName} room(s)` : "an earlier whole-hotel booking"}. Confirm the booking.`, path: "rentals" });
    await notifyUser(user._id, { type: "payment", title: "Hotel payment verified", message: `Your ${rental.roomName || "hotel"} payment is verified. The hotel will confirm your booking.`, link: "/account/rentals" });
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
  await Promise.all([
    notifyUser(user._id, { type: "payment", title: "Rental payment successful", message: `${formatGHS(payment.amount)} paid for "${title}". The owner will confirm your rental.`, link: "/account/rentals" }),
    notifyOwner(rental, { type: "payment", title: "Rental payment received", message: `${rental.contactName} paid ${formatGHS(payment.amount)} for "${title}". Confirm the rental.`, path: "rentals" }),
  ]);
};

// Identity and booking always come from stored records, never webhook metadata.
// No HTTP request/response is needed, so recovery does not depend on a login cookie.
export const processRentalPayment = async (payment, user, { successExpected = false } = {}) => {
  const rental = await Rental.findById(payment.rental);
  if (!rental) throw new HttpError(409, "Booking is missing. Contact support about your payment.");
  if (rentalPaymentMatchesBooking(payment, rental)) return { state: "paid", rental, payment, repeated: true };
  if (rentalPaymentNeedsReview(payment)) return { state: "review", rental, payment, review: payment.status, repeated: true };
  if (payment.status !== "paid" && paymentMode() === "disabled") throw new HttpError(503, "Online payments are not available right now. Please try again later.");
  const status = payment.status === "paid" ? "paid" : await paystackPaymentStatus(payment.reference, payment.amount);
  // A webhook may arrive before the verification API reflects the final result.
  // Keep the booking hold intact and let the caller retry.
  if (status === "pending" || (successExpected && status !== "paid")) return { state: "pending", rental, payment };
  const actor = user || await User.findById(payment.customer) || { _id: payment.customer, firstName: rental.contactName, role: "user" };
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
  if (!outcome.repeated) await notifyOutcome(outcome, actor);
  return { ...outcome, state: outcome.review ? "review" : "paid" };
};
