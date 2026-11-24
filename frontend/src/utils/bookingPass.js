import { formatDate } from "./date";

// "GHS 1,200" (the PDF font has no cedi sign)
const ghs = (value) => `GHS ${Number(value).toLocaleString("en-GB")}`;

// What a booking pass shows (on screen in components/receipts/BookingPass.jsx and in the PDF)
export const bookingRows = (booking) => [
  ["Where", booking.property?.title || ""],
  ...(booking.hotelId ? [["Room", `${booking.numberOfRooms} × ${booking.roomName}`]] : []),
  ...(booking.roomNumbers?.length ? [[booking.roomNumbers.length > 1 ? "Room numbers" : "Room number", booking.roomNumbers.join(", ")]] : []),
  ["Check-in", formatDate(booking.startDate)],
  ["Check-out", formatDate(booking.endDate)],
  ["Arriving at", booking.arrivalTime ? `${booking.arrivalTime} (Ghana time)` : "Not given yet"],
  ["Guest", booking.contactName],
  ["Total", ghs(booking.amount)],
  ["Payment", booking.paymentStatus === "Paid" ? "Paid" : `Pay ${ghs(booking.amount)} when you arrive`],
];
