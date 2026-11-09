import { test } from "node:test";
import assert from "node:assert/strict";
import { arrivalText, bookingHeadline, guestCanCancel, pastArrivalDeadline, payPlace } from "../src/utils/hotelPayments.js";

const reservation = { hotelId: "h1", statusKey: "confirmed", paymentOption: "on_arrival", paymentStatus: "Due at hotel", paymentDue: true, startDate: "2030-01-01T00:00:00.000Z", arrivalDeadline: "2030-01-01T14:00:00.000Z" };
const paidUp = { paymentStatus: "Paid", paymentDue: false };
// A rental priced per night, reserved to pay on arrival
const stay = { ...reservation, hotelId: null, paymentStatus: "Due on arrival" };

test("guests see which kind of confirmation they have", () => {
  assert.equal(bookingHeadline(reservation), "Reservation confirmed — Payment due at hotel");
  assert.equal(bookingHeadline({ ...reservation, ...paidUp, paymentOption: "online", statusKey: "paid" }), "Booking confirmed — Paid");
  assert.equal(bookingHeadline({ ...reservation, ...paidUp, paymentMethod: "At hotel", statusKey: "active" }), "Booking confirmed — Paid", "paid on arrival");
  assert.equal(bookingHeadline({ ...reservation, statusKey: "pending", paymentStatus: "Pending", paymentDue: false }), null, "not booked yet");
  assert.equal(bookingHeadline({ ...reservation, statusKey: "cancelled" }), null);
});

test("per-night rentals: reservations get the same wording; online rentals keep their own", () => {
  assert.equal(bookingHeadline(stay), "Reservation confirmed — Payment due on arrival");
  assert.equal(bookingHeadline({ ...stay, ...paidUp, paymentMethod: "On arrival", statusKey: "active" }), "Booking confirmed — Paid");
  assert.equal(bookingHeadline({ ...stay, ...paidUp, paymentOption: "online", statusKey: "paid" }), null, "paid online, waiting for the owner to confirm");
  assert.equal(payPlace(reservation), "at the hotel");
  assert.equal(payPlace(stay), "on arrival");
});

test("arrival deadline is shown in Ghana time", () => {
  assert.match(arrivalText(reservation), /^on Tue,? 1 Jan 2030 by 14:00$/);
  assert.equal(arrivalText({ ...reservation, arrivalDeadline: null }), "on your check-in day");
});

test("no-show only after the deadline; guest cancellation only before check-in day", () => {
  for (const booking of [reservation, stay]) {
    assert.equal(pastArrivalDeadline(booking, Date.parse("2030-01-01T13:59:00Z")), false);
    assert.equal(pastArrivalDeadline(booking, Date.parse("2030-01-01T14:01:00Z")), true);
    assert.equal(pastArrivalDeadline({ ...booking, ...paidUp }, Date.parse("2030-01-02T00:00:00Z")), false);
    assert.equal(guestCanCancel(booking, new Date("2029-12-31T23:00:00Z")), true);
    assert.equal(guestCanCancel(booking, new Date("2030-01-01T08:00:00Z")), false, "on the day: contact the owner");
    assert.equal(guestCanCancel({ ...booking, paymentOption: "online" }, new Date("2029-12-01T00:00:00Z")), false, "paid bookings go through the owner");
  }
});
