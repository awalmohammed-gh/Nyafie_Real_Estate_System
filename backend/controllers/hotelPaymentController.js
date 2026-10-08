import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import { paymentReturnUrl } from "../config/runtime.js";
import { hotelTransaction, quoteHotelRoom, roomAvailability, occupancyFilter, HOTEL_HOLD, hotelPrice } from "../utils/hotel.js";
import { loadPublishedProperty } from "../utils/ownership.js";
import { paystack, paystackPaymentStatus, newReference, toSubunit } from "../utils/paystack.js";
import { HttpError, ok, fail } from "../utils/response.js";
import { notifyOwner, notifyUser } from "../utils/notify.js";
import { addHistory, populateRental, presentRental } from "./rentalController.js";

const result = async (id, user) => presentRental(await populateRental(Rental.findById(id)), user);
export const verifyHotelPayment = async (req, res, payment, initial) => {
  const status = await paystackPaymentStatus(payment.reference, payment.amount);
  if (status === "pending") return fail(res, 409, "Paystack is still processing this payment. Please check again shortly; do not start another payment.");
  if (status === "paid") return confirmHotelPayment(req, res, payment);
  await hotelTransaction(initial.hotelId || initial.property, async (_hotel, session) => {
    await Payment.updateOne({ _id: payment._id, status: "pending" }, { status: "failed" }, { session });
    await Rental.updateOne({ _id: initial._id, paymentStatus: { $ne: "paid" }, paymentReference: payment.reference, status: "payment_pending" }, { status: "pending", paymentStatus: "failed" }, { session });
  });
  return fail(res, 402, "Your hotel payment was not completed. Your booking has not been confirmed.");
};
export const initializeHotelPayment = async (req, res, initial) => {
  if (!await loadPublishedProperty(initial.hotelId)) return fail(res, 404, "This hotel is no longer available for new checkouts.");
  const prepared = await hotelTransaction(initial.hotelId, async (hotel, session) => {
    const rental = await Rental.findOne({ _id: initial._id, customer: req.user._id }).session(session);
    if (!rental || rental.paymentStatus === "paid" || !["pending", "payment_pending"].includes(rental.status)) throw new HttpError(409, "This booking cannot start a payment.");
    const quote = await quoteHotelRoom(hotel, { roomTypeId: rental.roomTypeId, checkIn: rental.startDate.toISOString().slice(0, 10), checkOut: rental.endDate.toISOString().slice(0, 10), guests: rental.occupants, numberOfRooms: rental.numberOfRooms }, { session, excludeId: rental._id });
    if (rental.status === "payment_pending" && rental.paymentStartedAt > new Date(Date.now() - HOTEL_HOLD)) {
      const current = await Payment.findOne({ reference: rental.paymentReference, rental: rental._id, status: "pending" }).session(session);
      if (current) {
        if (!current.authorizationUrl) throw new HttpError(409, "Your secure checkout is being prepared. Please try again shortly.");
        return { payment: current, resume: true };
      }
    }
    // Use the server's immutable quote saved when the booking was created.
    if (rental.units !== quote.units) throw new HttpError(409, "Booking dates need review. Please contact support.");
    if (rental.amount !== hotelPrice(rental.unitPrice, rental.units, rental.numberOfRooms)) throw new HttpError(409, "Booking total needs review. Please contact support.");
    const payment = new Payment({ kind: "rental", rental: rental._id, customer: req.user._id, property: hotel._id, owner: hotel.owner, ownerType: hotel.ownerType, amount: rental.amount, method: "Paystack", reference: newReference("HBH") });
    await payment.save({ session });
    rental.set({ status: "payment_pending", paymentStatus: "pending", paymentReference: payment.reference, paymentStartedAt: new Date() });
    addHistory(rental, req.user, `Hotel checkout started: ${rental.numberOfRooms} ${rental.roomName} room(s)`);
    await rental.save({ session });
    return { payment, rental };
  });
  const { payment, rental, resume } = prepared;
  if (!resume) {
    try {
      const provider = await paystack("/transaction/initialize", { method: "POST", body: JSON.stringify({ email: rental.contactEmail, amount: toSubunit(payment.amount), currency: "GHS", reference: payment.reference, callback_url: `${paymentReturnUrl(req)}/payment/success?reference=${payment.reference}`, metadata: { type: "hotel", rentalId: String(rental._id), hotelId: String(rental.hotelId), roomTypeId: String(rental.roomTypeId) } }) });
      if (!provider.status || !provider.data?.authorization_url) throw new HttpError(502, "Could not start the payment. Please try again.");
      await Payment.updateOne({ _id: payment._id }, { authorizationUrl: provider.data.authorization_url });
      payment.authorizationUrl = provider.data.authorization_url;
    } catch (error) {
      await hotelTransaction(initial.hotelId, async (_hotel, session) => {
        await Payment.updateOne({ _id: payment._id, status: "pending" }, { status: "failed" }, { session });
        await Rental.updateOne({ _id: initial._id, paymentReference: payment.reference, status: "payment_pending", paymentStatus: { $ne: "paid" } }, { status: "pending", paymentStatus: "failed" }, { session });
      });
      throw error;
    }
  }
  return ok(res, { mode: "paystack", reference: payment.reference, amount: payment.amount, authorizationUrl: payment.authorizationUrl }, resume ? "Payment resumed" : "Payment started");
};

// Called only after server-to-server provider verification has succeeded.
export const confirmHotelPayment = async (req, res, payment) => {
  const initial = await Rental.findById(payment.rental);
  if (!initial) throw new HttpError(409, "Booking is missing. Contact support about your payment.");
  const outcome = await hotelTransaction(initial.hotelId || initial.property, async (hotel, session) => {
    const currentPayment = await Payment.findById(payment._id).session(session);
    const rental = await Rental.findById(payment.rental).session(session);
    if (currentPayment.status === "paid") return { id: rental._id, repeated: true };
    if (["duplicate", "refund_required"].includes(currentPayment.status)) return { review: true };
    currentPayment.paidAt = new Date();
    let problem = "";
    if (rental.paymentStatus === "paid") problem = "Duplicate successful payment for an already paid booking.";
    else if (!["pending", "payment_pending"].includes(rental.status)) problem = "Payment arrived after this booking was cancelled.";
    else if (currentPayment.amount !== rental.amount) problem = "Payment does not match the saved booking total.";
    else if (!rental.roomTypeId) {
      // A pre-room-types checkout reserved the whole hotel. Honor it only if
      // no other booking occupies any room during its dates.
      const filter = occupancyFilter(hotel._id, null, rental.startDate, rental.endDate, rental._id);
      delete filter.hotelId; delete filter.roomTypeId;
      if (await Rental.exists({ ...filter, property: hotel._id }).session(session)) problem = "Legacy whole-hotel payment overlaps newer room reservations.";
    }
    else {
      const room = hotel.roomTypes.id(rental.roomTypeId);
      if (!room || rental.numberOfRooms > await roomAvailability(hotel._id, room, rental.startDate, rental.endDate, { session, excludeId: rental._id })) problem = "Payment arrived after the room hold expired and inventory is no longer available.";
    }
    if (problem) {
      currentPayment.set({ status: rental.paymentStatus === "paid" ? "duplicate" : "refund_required", note: problem });
      await currentPayment.save({ session });
      // Keep successful bookings intact; release any failed booking's old hold.
      if (rental.paymentStatus !== "paid") { rental.status = "cancelled"; addHistory(rental, req.user, "Payment received; refund required. Booking could not be fulfilled."); await rental.save({ session }); }
      return { review: true };
    }
    currentPayment.status = "paid";
    await currentPayment.save({ session });
    rental.set({ status: "paid", paymentStatus: "paid", paidAt: currentPayment.paidAt, paymentReference: currentPayment.reference, paymentMethod: "Paystack" });
    addHistory(rental, req.user, `Hotel payment verified (${currentPayment.reference})`);
    await rental.save({ session });
    return { id: rental._id };
  });
  if (outcome.review) {
    await notifyOwner({ ownerType: "admin" }, { critical: true, type: "payment", title: "Hotel payment requires refund", message: `Review payment ${payment.reference}. The booking could not be fulfilled.`, path: "payments" });
    return fail(res, 409, "Your payment was received but this booking could not be fulfilled. Contact HomeBase to arrange a refund; do not pay again.");
  }
  if (!outcome.repeated) {
    await notifyOwner(initial, { type: "payment", title: "Hotel booking paid", message: `${initial.contactName} paid for ${initial.roomTypeId ? `${initial.numberOfRooms} ${initial.roomName} room(s)` : "an earlier whole-hotel booking"}. Confirm the booking.`, path: "rentals" });
    await notifyUser(req.user._id, { type: "payment", title: "Hotel payment verified", message: `Your ${initial.roomName || "hotel"} payment is verified. The hotel will confirm your booking.`, link: "/account/rentals" });
  }
  return ok(res, await result(outcome.id, req.user), "Hotel booking paid");
};
