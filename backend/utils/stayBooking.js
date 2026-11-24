import { randomInt } from "node:crypto";
import { HttpError } from "./response.js";
import { stayBookingSettings } from "./hotelPayout.js";

/*
 * What a guest gives and gets for a stay (hotels and rentals priced per night):
 *  - their arrival time on the check-in day, so the hotel or owner knows when to expect them
 *    (no later than the listing's arrival deadline)
 *  - a booking code to show when they arrive and pay (NF-7KQ9PX), also in their confirmation email
 */

// No 0/O or 1/I/L: easy to read out at a front desk
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const newBookingCode = () => `NF-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "15:30" for this listing, or a 400 the guest can act on */
export const parseArrivalTime = (value, listing) => {
  const time = typeof value === "string" ? value.trim() : "";
  if (!TIME.test(time)) throw new HttpError(400, "Tell the hotel or owner when you'll arrive on your check-in day (for example 15:30).");
  const { arrivalDeadline } = stayBookingSettings(listing);
  if (arrivalDeadline && time > arrivalDeadline) throw new HttpError(400, `Guests are asked to arrive by ${arrivalDeadline} on the check-in day. Choose an earlier time, or contact the ${String(listing?.propertyType || "").toLowerCase() === "hotel" ? "hotel" : "owner"} first.`);
  return time;
};

/**
 * After a stay is reserved or paid: the guest's confirmation email with the booking code. Best effort:
 * the booking stands either way, and the code is also in the guest's account.
 */
export const sendBookingConfirmation = async (rental, { place, paid = false }) => {
  if (!rental?.bookingCode || !rental.contactEmail) return;
  const { bookingConfirmationMailer } = await import("./email.js");
  const { formatGHS } = await import("./ownership.js");
  const day = (date) => new Date(date).toISOString().slice(0, 10);
  try {
    await bookingConfirmationMailer.send(rental.contactEmail, {
      bookingCode: rental.bookingCode, place, room: rental.roomName ? `${rental.numberOfRooms} × ${rental.roomName}` : "",
      checkIn: day(rental.startDate), checkOut: day(rental.endDate), arrivalTime: rental.arrivalTime || "—", guestName: rental.contactName,
      total: formatGHS(rental.amount), paid,
      payment: paid ? "Paid online to the hotel" : `Pay ${formatGHS(rental.amount)} when you arrive`,
    });
  } catch (error) {
    console.error("Booking confirmation email failed:", error.message);
  }
};
