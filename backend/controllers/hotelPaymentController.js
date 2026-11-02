import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import { paymentReturnUrl } from "../config/runtime.js";
import { hotelTransaction, quoteHotelRoom, HOTEL_HOLD, hotelPrice } from "../utils/hotel.js";
import { loadPublishedProperty } from "../utils/ownership.js";
import { paystack, newReference, toSubunit, inCurrentEnvironment, paymentEnvironment } from "../utils/paystack.js";
import { HttpError, ok, fail } from "../utils/response.js";
import { addHistory } from "./rentalController.js";

export const initializeHotelPayment = async (req, res, initial) => {
  if (!await loadPublishedProperty(initial.hotelId)) return fail(res, 404, "This hotel is no longer available for new checkouts.");
  const prepared = await hotelTransaction(initial.hotelId, async (hotel, session) => {
    const rental = await Rental.findOne({ _id: initial._id, customer: req.user._id }).session(session);
    if (!rental || rental.paymentStatus === "paid" || !["pending", "payment_pending"].includes(rental.status)) throw new HttpError(409, "This booking cannot start a payment.");
    const quote = await quoteHotelRoom(hotel, { roomTypeId: rental.roomTypeId, checkIn: rental.startDate.toISOString().slice(0, 10), checkOut: rental.endDate.toISOString().slice(0, 10), guests: rental.occupants, numberOfRooms: rental.numberOfRooms }, { session, excludeId: rental._id });
    if (rental.status === "payment_pending" && rental.paymentStartedAt > new Date(Date.now() - HOTEL_HOLD)) {
      const current = await Payment.findOne({ reference: rental.paymentReference, rental: rental._id, status: "pending" }).session(session);
      if (current && inCurrentEnvironment(current)) {
        if (!current.authorizationUrl) throw new HttpError(409, "Your secure checkout is being prepared. Please try again shortly.");
        return { payment: current, resume: true };
      }
    }
    // Use the server's immutable quote saved when the booking was created.
    if (rental.units !== quote.units) throw new HttpError(409, "Booking dates need review. Please contact support.");
    if (rental.amount !== hotelPrice(rental.unitPrice, rental.units, rental.numberOfRooms)) throw new HttpError(409, "Booking total needs review. Please contact support.");
    const payment = new Payment({ kind: "rental", rental: rental._id, customer: req.user._id, property: hotel._id, owner: hotel.owner, ownerType: hotel.ownerType, amount: rental.amount, method: "Paystack", environment: paymentEnvironment(), reference: newReference("HBH") });
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
