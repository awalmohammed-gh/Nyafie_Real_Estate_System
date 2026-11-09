import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import { hotelTransaction, roomAvailability, occupancyFilter } from "./hotel.js";
import { HttpError } from "./response.js";
import { addHistory } from "../controllers/rentalController.js";
import { rentalPaymentMatchesBooking, rentalPaymentNeedsReview } from "./confirmRentalPayment.js";

// Shared by browser verification, signed webhooks and scheduled recovery.
// Call only after Paystack has verified this charge.
export const confirmHotelPayment = async (payment, user, initial) => {
  return hotelTransaction(initial.hotelId || initial.property, async (hotel, session) => {
    const currentPayment = await Payment.findById(payment._id).session(session);
    const rental = await Rental.findById(payment.rental).session(session);
    if (!currentPayment || !rental) throw new HttpError(409, "Booking is missing. Contact support about your payment.");
    if (rentalPaymentMatchesBooking(currentPayment, rental)) return { rental, payment: currentPayment, repeated: true };
    if (rentalPaymentNeedsReview(currentPayment)) return { rental, payment: currentPayment, review: currentPayment.status, repeated: true };
    currentPayment.paidAt ||= new Date();
    // The guest started paying online, then reserved to pay at the hotel, and the online payment
    // went through after all. The rooms are already held by the reservation: it is now paid.
    if (rental.paymentOption === "on_arrival" && rental.status === "confirmed" && rental.paymentStatus === "due" && currentPayment.amount === rental.amount) {
      currentPayment.status = "paid";
      await currentPayment.save({ session });
      rental.set({ paymentStatus: "paid", paymentOption: "online", paymentMethod: "Paystack", paidAt: currentPayment.paidAt, paymentReference: currentPayment.reference });
      addHistory(rental, user, `Online payment received (${currentPayment.reference}); nothing is due at the hotel`);
      await rental.save({ session });
      return { rental, payment: currentPayment };
    }
    let problem = "";
    if (rental.paymentStatus === "paid" && rental.paymentReference !== currentPayment.reference) problem = "Duplicate successful payment for an already paid booking.";
    else if (!["pending", "payment_pending"].includes(rental.status)) problem = "Payment arrived after this booking was cancelled.";
    else if (currentPayment.amount !== rental.amount) problem = "Payment does not match the saved booking total.";
    else if (!rental.roomTypeId) {
      const filter = occupancyFilter(hotel._id, null, rental.startDate, rental.endDate, rental._id);
      delete filter.hotelId; delete filter.roomTypeId;
      if (await Rental.exists({ ...filter, property: hotel._id }).session(session)) problem = "Legacy whole-hotel payment overlaps newer room reservations.";
    } else {
      const room = hotel.roomTypes.id(rental.roomTypeId);
      if (!room || rental.numberOfRooms > await roomAvailability(hotel._id, room, rental.startDate, rental.endDate, { session, excludeId: rental._id })) problem = "Payment arrived after the room hold expired and inventory is no longer available.";
    }
    if (problem) {
      currentPayment.set({ status: rental.paymentStatus === "paid" ? "duplicate" : "refund_required", note: problem });
      await currentPayment.save({ session });
      if (rental.paymentStatus !== "paid" && rental.status !== "cancelled") {
        rental.status = "cancelled";
        addHistory(rental, user, "Payment received; refund required. Booking could not be fulfilled.");
        await rental.save({ session });
      }
      return { rental, payment: currentPayment, review: currentPayment.status };
    }
    currentPayment.status = "paid";
    await currentPayment.save({ session });
    rental.set({ status: "paid", paymentStatus: "paid", paidAt: currentPayment.paidAt, paymentReference: currentPayment.reference, paymentMethod: "Paystack" });
    addHistory(rental, user, `Hotel payment verified (${currentPayment.reference})`);
    await rental.save({ session });
    return { rental, payment: currentPayment };
  });
};
