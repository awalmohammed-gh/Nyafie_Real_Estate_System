// How a stay's payment is described to guests and owners (hotels and per-night rentals; bookings from mapRental)

// A listing's payment options before its owner changes them (the server uses the same defaults):
// hotels start with pay at the hotel only; per-night rentals keep online payment and add pay on arrival
export const STAY_BOOKING_DEFAULTS = { payOnArrival: true, payOnline: false, arrivalDeadline: "18:00", cancellationPolicy: "" };
export const NIGHTLY_RENTAL_DEFAULTS = { ...STAY_BOOKING_DEFAULTS, payOnline: true };

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }); // Ghana is GMT
const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const paid = (booking) => booking.paymentStatus === "Paid";
const onArrival = (booking) => booking.paymentOption === "on_arrival";
// A pay-on-arrival reservation that hasn't been paid yet
const dueOnArrival = (booking) => onArrival(booking) && booking.paymentDue;
const reservedOrPaid = (booking) => ["paid", "confirmed", "active"].includes(booking.statusKey);

// "at the hotel" / "on arrival"
export const payPlace = (booking) => (booking?.hotelId ? "at the hotel" : "on arrival");

/**
 * "Booking confirmed — Paid" | "Reservation confirmed — Payment due at hotel" (or "… due on arrival"
 * for a per-night rental) | null (not booked yet, finished, or a rental that keeps its own wording).
 * A pay-on-arrival reservation the guest then paid for reads as paid.
 */
export const bookingHeadline = (booking) => {
  if (!booking || !(booking.hotelId || onArrival(booking)) || !reservedOrPaid(booking)) return null;
  if (paid(booking)) return "Booking confirmed — Paid";
  if (dueOnArrival(booking)) return booking.hotelId ? "Reservation confirmed — Payment due at hotel" : "Reservation confirmed — Payment due on arrival";
  return null;
};

// "on Wed 1 Jan 2030 by 14:00"
export const arrivalText = (booking) => {
  if (!booking.arrivalDeadline) return "on your check-in day";
  const deadline = new Date(booking.arrivalDeadline);
  return `on ${DAY.format(deadline)} by ${TIME.format(deadline)}`;
};

// The owner may treat a guest who hasn't arrived by the deadline as a no-show
export const pastArrivalDeadline = (booking, now = Date.now()) =>
  dueOnArrival(booking) && booking.statusKey === "confirmed" && Boolean(booking.arrivalDeadline) && now > new Date(booking.arrivalDeadline).getTime();

// Guests may cancel a pay-on-arrival reservation online until their check-in day (the server agrees)
export const guestCanCancel = (booking, now = new Date()) =>
  dueOnArrival(booking) && booking.statusKey === "confirmed" && now.toISOString().slice(0, 10) < String(booking.startDate).slice(0, 10);
