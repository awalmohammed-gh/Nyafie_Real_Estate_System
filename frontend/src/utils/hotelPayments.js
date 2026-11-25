// How a stay's payment is described to guests and owners (hotels and per-night rentals; bookings from mapRental)

// A listing's payment options before its owner changes them (the server uses the same defaults):
// agent hotels start with both ways (online payment opens once the payout account is connected)
export const STAY_BOOKING_DEFAULTS = { payOnArrival: true, payOnline: true, arrivalDeadline: "18:00", cancellationPolicy: "" };
// Per-night rentals are paid on arrival only (NyaFie never takes customers' money online)
export const NIGHTLY_RENTAL_DEFAULTS = { ...STAY_BOOKING_DEFAULTS, payOnline: false };

/**
 * The ways a guest can pay a hotel, in order. `options` is the listing's paymentOptions from the server.
 * Online stays visible with its reason while the hotel is still setting it up.
 */
export const hotelPayChoices = (options) => [
  ...(options.online || options.onlineOffered ? [{ id: "online", available: Boolean(options.online), problem: options.online ? "" : options.onlineProblem || "Online payment isn't available right now." }] : []),
  ...(options.onArrival ? [{ id: "on_arrival", available: true, problem: "" }] : []),
];

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
  // Hotels approve each booking and assign the room; the booking receipt comes then
  if (booking.awaitingApproval) {
    const waiting = booking.hotelId ? "waiting for the hotel to approve and assign your room" : "waiting for the owner to approve";
    return paid(booking) ? `Paid — ${waiting}` : `Reservation sent — ${waiting}`;
  }
  if (booking.hotelId && booking.approvedAt && booking.roomNumbers?.length) return `Booking approved — room ${booking.roomNumbers.join(", ")}${paid(booking) ? " · Paid" : " · Pay at the hotel"}`;
  if (paid(booking)) return "Booking confirmed — Paid";
  if (dueOnArrival(booking)) return booking.hotelId ? "Reservation confirmed — Payment due at hotel" : "Reservation confirmed — Payment due on arrival";
  return null;
};

// "Tue 9 Jun 2030, 14:00": when an unapproved hotel booking is cancelled automatically (Ghana time)
export const approvalDeadlineText = (booking) => (booking?.approvalDeadline ? `${DAY.format(new Date(booking.approvalDeadline))}, ${TIME.format(new Date(booking.approvalDeadline))}` : "");

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
  // Office rentals (monthly and fixed-price rent) too: a request, or a confirmation not yet paid for
  (booking.paysAtOffice && booking.statusKey === "pending") ||
  ((dueOnArrival(booking) || (booking.paymentOption === "office" && booking.paymentDue)) && booking.statusKey === "confirmed" && now.toISOString().slice(0, 10) < String(booking.startDate).slice(0, 10));
