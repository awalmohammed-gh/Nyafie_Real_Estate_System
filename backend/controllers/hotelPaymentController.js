import mongoose from "mongoose";
import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import { paymentReturnUrl } from "../config/runtime.js";
import { hotelTransaction, quoteHotelRoom, HOTEL_HOLD, hotelPrice } from "../utils/hotel.js";
import { loadPublishedProperty } from "../utils/ownership.js";
import { paystack, newReference, toSubunit, inCurrentEnvironment, paymentEnvironment } from "../utils/paystack.js";
import { HttpError, ok, fail } from "../utils/response.js";
import { addHistory, populateRental, presentRental, quoteRental, toDay } from "./rentalController.js";
import { postSystemNote } from "./chatController.js";
import { PAYMENT_HOLD, rentalInventoryTransaction } from "../utils/rentalAvailability.js";
import { getSettings } from "../models/Setting.js";
import { arrivalDeadlineFor, stayBookingSettings, stayPaymentOptions, payoutAccountFor, takesStayBookings } from "../utils/hotelPayout.js";
import { notifyOwner, notifyUser } from "../utils/notify.js";
import { formatGHS } from "../utils/ownership.js";

// The rental's saved selection, as a quote request (the server's own values, never the client's)
const savedSelection = (rental) => ({ roomTypeId: rental.roomTypeId, checkIn: rental.startDate.toISOString().slice(0, 10), checkOut: rental.endDate.toISOString().slice(0, 10), guests: rental.occupants, numberOfRooms: rental.numberOfRooms });

export const initializeHotelPayment = async (req, res, initial) => {
  const published = await loadPublishedProperty(initial.hotelId);
  if (!published) return fail(res, 404, "This hotel is no longer available for new checkouts.");
  // Online payments settle to the hotel's own payout account (NyaFie's hotels: the main account)
  const payout = await payoutAccountFor(published);
  const options = stayPaymentOptions(published, payout, await getSettings());
  if (!options.online) return fail(res, 409, `${options.onlineProblem}${options.onArrival ? " You can reserve now and pay at the hotel." : ""}`);
  const subaccount = payout?.subaccountCode || null;
  const prepared = await hotelTransaction(initial.hotelId, async (hotel, session) => {
    const rental = await Rental.findOne({ _id: initial._id, customer: req.user._id }).session(session);
    if (!rental || rental.paymentStatus === "paid" || !["pending", "payment_pending"].includes(rental.status)) throw new HttpError(409, "This booking cannot start a payment.");
    const quote = await quoteHotelRoom(hotel, savedSelection(rental), { session, excludeId: rental._id });
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
    const payment = new Payment({ kind: "rental", rental: rental._id, customer: req.user._id, property: hotel._id, owner: hotel.owner, ownerType: hotel.ownerType, amount: rental.amount, method: "Paystack", environment: paymentEnvironment(), subaccount, reference: newReference("HBH") });
    await payment.save({ session });
    rental.set({ status: "payment_pending", paymentStatus: "pending", paymentOption: "online", paymentMethod: "Paystack", paymentReference: payment.reference, paymentStartedAt: new Date() });
    addHistory(rental, req.user, `Hotel checkout started: ${rental.numberOfRooms} ${rental.roomName} room(s)`);
    await rental.save({ session });
    return { payment, rental };
  });
  const { payment, rental, resume } = prepared;
  if (!resume) {
    try {
      const provider = await paystack("/transaction/initialize", { method: "POST", body: JSON.stringify({ email: rental.contactEmail, amount: toSubunit(payment.amount), currency: "GHS", reference: payment.reference, ...(payment.subaccount ? { subaccount: payment.subaccount, bearer: "subaccount" } : {}), callback_url: `${paymentReturnUrl(req)}/payment/success?reference=${payment.reference}`, metadata: { type: "hotel", rentalId: String(rental._id), hotelId: String(rental.hotelId), roomTypeId: String(rental.roomTypeId) } }) });
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

/**
 * POST /api/rentals/:id/reserve -> "Reserve now, pay at the hotel" (or, for a per-night rental,
 * "pay on arrival"). Confirms the reservation only once the rooms or dates are secured (same
 * transaction and availability check as a checkout). No money is taken: the hotel or owner
 * records the payment when the guest arrives.
 */
export const reserveOnArrival = async (req, res) => {
  const initial = mongoose.isValidObjectId(req.params.id) ? await Rental.findOne({ _id: req.params.id, customer: req.user._id }) : null;
  if (!initial) return fail(res, 404, "Booking not found.");
  if (!initial.hotelId) return reserveRentalOnArrival(req, res, initial);
  const published = await loadPublishedProperty(initial.hotelId);
  if (!published) return fail(res, 404, "This hotel is no longer taking reservations.");
  if (!stayBookingSettings(published).payOnArrival) return fail(res, 409, "This hotel doesn't take payment on arrival. Pay online to book your stay.");

  const { rental, repeated } = await hotelTransaction(initial.hotelId, async (hotel, session) => {
    const rental = await Rental.findOne({ _id: initial._id, customer: req.user._id }).session(session);
    if (rental.paymentOption === "on_arrival" && rental.status === "confirmed") return { rental, repeated: true };
    if (rental.paymentStatus === "paid" || !["pending", "payment_pending"].includes(rental.status)) throw new HttpError(409, `This booking is ${rental.status.replace("_", " ")}.`);
    // An online checkout still in progress could charge the guest as well: let it finish or lapse
    if (rental.status === "payment_pending" && rental.paymentStartedAt > new Date(Date.now() - HOTEL_HOLD)) throw new HttpError(409, "Your online payment is still in progress. Finish it, or wait 30 minutes before choosing to pay at the hotel.");
    const quote = await quoteHotelRoom(hotel, savedSelection(rental), { session, excludeId: rental._id });
    if (rental.units !== quote.units || rental.amount !== hotelPrice(rental.unitPrice, rental.units, rental.numberOfRooms)) throw new HttpError(409, "Booking details need review. Please contact support.");
    const settings = stayBookingSettings(hotel);
    rental.set({
      status: "confirmed", paymentStatus: "due", paymentOption: "on_arrival", paymentMethod: "At hotel",
      arrivalDeadline: arrivalDeadlineFor(rental.startDate, settings.arrivalDeadline), cancellationPolicy: settings.cancellationPolicy,
    });
    // The earlier online attempt (if any) stays in the Payment ledger. If it still succeeds late,
    // confirmHotelPayment settles this reservation with it instead of charging twice.
    rental.paymentReference = undefined;
    addHistory(rental, req.user, "Reservation confirmed — payment due at the hotel");
    await rental.save({ session });
    return { rental };
  });
  if (!repeated) {
    const arrive = `${rental.startDate.toISOString().slice(0, 10)} by ${rental.arrivalDeadline.toISOString().slice(11, 16)}`;
    await Promise.all([
      notifyUser(req.user._id, { type: "rental", title: "Reservation confirmed", message: `Your ${rental.roomName} reservation at "${published.title}" is confirmed. Pay ${formatGHS(rental.amount)} at the hotel; please arrive on ${arrive}.`, link: "/account/rentals" }),
      notifyOwner(rental, { type: "rental", title: "New reservation (pay at hotel)", message: `${rental.contactName} reserved ${rental.numberOfRooms} ${rental.roomName} room(s) for ${rental.startDate.toISOString().slice(0, 10)}. ${formatGHS(rental.amount)} is due at the hotel.`, path: "rentals" }),
    ]);
  }
  ok(res, presentRental(await populateRental(Rental.findById(rental._id)), req.user), repeated ? "Reservation already confirmed" : "Reservation confirmed");
};

// The same reservation for a rental priced per night: its dates are held, payment is due on arrival
const reserveRentalOnArrival = async (req, res, initial) => {
  const published = await loadPublishedProperty(initial.property);
  if (!published) return fail(res, 404, "This listing is no longer taking reservations.");
  const allowed = (listing) => takesStayBookings(listing) && stayBookingSettings(listing).payOnArrival;
  if (!allowed(published)) return fail(res, 409, "This listing doesn't take payment on arrival. Pay online to book your stay.");

  const { rental, repeated } = await rentalInventoryTransaction(initial.property, async (_property, session) => {
    const rental = await Rental.findOne({ _id: initial._id, customer: req.user._id }).session(session);
    if (rental.paymentOption === "on_arrival" && rental.status === "confirmed") return { rental, repeated: true };
    if (rental.paymentStatus === "paid" || !["pending", "payment_pending"].includes(rental.status)) throw new HttpError(409, `This rental is ${rental.status.replace("_", " ")}.`);
    // An online checkout still in progress could charge the guest as well: let it finish or lapse
    if (rental.status === "payment_pending" && rental.paymentStartedAt > new Date(Date.now() - PAYMENT_HOLD)) throw new HttpError(409, "Your online payment is still in progress. Finish it, or wait 30 minutes before choosing to pay on arrival.");
    // Re-checks the listing and that the dates are still free (excluding this request), with fresh prices
    const quote = await quoteRental({ propertyId: rental.property, startDate: toDay(rental.startDate), endDate: toDay(rental.endDate) }, req.user, { session, excludeId: rental._id });
    if (quote.error) throw new HttpError(quote.status, quote.error);
    if (!allowed(quote.property)) throw new HttpError(409, "This listing doesn't take payment on arrival. Pay online to book your stay.");
    const settings = stayBookingSettings(quote.property);
    rental.set({
      amount: quote.amount, units: quote.units, unitPrice: quote.property.price,
      status: "confirmed", paymentStatus: "due", paymentOption: "on_arrival", paymentMethod: "On arrival",
      arrivalDeadline: arrivalDeadlineFor(rental.startDate, settings.arrivalDeadline), cancellationPolicy: settings.cancellationPolicy,
    });
    // A lapsed online attempt stays in the Payment ledger; if it still succeeds, it settles this reservation
    rental.paymentReference = undefined;
    addHistory(rental, req.user, "Reservation confirmed — payment due on arrival");
    await rental.save({ session });
    return { rental };
  });
  if (!repeated) {
    const day = toDay(rental.startDate);
    const arrive = `${day} by ${rental.arrivalDeadline.toISOString().slice(11, 16)}`;
    try {
      const conversation = await postSystemNote(published, req.user._id, req.user, "customer", `Reserved ${day} – ${toDay(rental.endDate)}: ${formatGHS(rental.amount)} to pay on arrival (arrive by ${arrive}).`);
      await Rental.updateOne({ _id: rental._id }, { $set: { conversation: conversation._id } });
    } catch (error) { console.error("Reservation chat note failed:", error.message); }
    await Promise.all([
      notifyUser(req.user._id, { type: "rental", title: "Reservation confirmed", message: `Your stay at "${published.title}" is reserved. Pay ${formatGHS(rental.amount)} on arrival; please arrive on ${arrive}.`, link: "/account/rentals" }),
      notifyOwner(rental, { type: "rental", title: "New reservation (pay on arrival)", message: `${rental.contactName} reserved "${published.title}" from ${day}. ${formatGHS(rental.amount)} is due on arrival.`, path: "rentals" }),
    ]);
  }
  ok(res, presentRental(await populateRental(Rental.findById(rental._id)), req.user), repeated ? "Reservation already confirmed" : "Reservation confirmed");
};
