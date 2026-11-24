import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Rental from "../models/Rental.js";
import Property from "../models/Property.js";
import Notification from "../models/Notification.js";
import { bookingConfirmationMailer } from "../utils/email.js";
import { newBookingCode, parseArrivalTime, sendBookingConfirmation } from "../utils/stayBooking.js";
import { updateArrivalTime } from "../controllers/rentalController.js";

const id = () => new mongoose.Types.ObjectId();
const CUSTOMER = id();
const hotel = (stayBooking = {}) => ({ propertyType: "Hotel", listingType: "Rent", pricePeriod: "night", ownerType: "agent", stayBooking: { arrivalDeadline: "20:00", ...stayBooking } });
const query = (value) => {
  const chain = { then: (yes, no) => Promise.resolve(typeof value === "function" ? value() : value).then(yes, no) };
  for (const name of ["populate", "select", "lean", "session"]) chain[name] = () => chain;
  return chain;
};
const response = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};
const days = (n) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + n));

test("guests say when they'll arrive, no later than the hotel's arrival deadline", () => {
  assert.equal(parseArrivalTime("15:30", hotel()), "15:30");
  assert.equal(parseArrivalTime(" 20:00 ", hotel()), "20:00", "the deadline itself is fine");
  assert.throws(() => parseArrivalTime("21:15", hotel()), /arrive by 20:00/);
  for (const bad of [undefined, "", "3pm", "24:00", "7:5", 1530, null]) assert.throws(() => parseArrivalTime(bad, hotel()), { status: 400 }, String(bad));
  assert.equal(parseArrivalTime("17:45", { propertyType: "Apartment", listingType: "Rent", pricePeriod: "night" }), "17:45", "short stays: the default 18:00 deadline");
});

test("booking codes are short, easy to read out and unique", () => {
  const codes = new Set(Array.from({ length: 500 }, newBookingCode));
  assert.equal(codes.size, 500);
  for (const code of codes) assert.match(code, /^NF-[A-HJKMNP-Z2-9]{6}$/, "no 0/O or 1/I/L");
});

test("the confirmation email carries the booking code and says nothing was paid online", async (t) => {
  const sent = [];
  t.mock.method(bookingConfirmationMailer, "send", async (email, booking) => { sent.push({ email, booking }); });
  await sendBookingConfirmation({ bookingCode: "NF-7KQ9PX", contactEmail: "guest@example.test", contactName: "Esi", roomName: "Deluxe", numberOfRooms: 1, startDate: days(3), endDate: days(5), arrivalTime: "14:00", amount: 900 }, { place: "Palm Hotel" });
  assert.equal(sent.length, 1);
  assert.deepEqual([sent[0].email, sent[0].booking.bookingCode, sent[0].booking.arrivalTime, sent[0].booking.paid], ["guest@example.test", "NF-7KQ9PX", "14:00", false]);
  assert.match(sent[0].booking.payment, /when you arrive/);
  // No code, no email; a failing mail server never breaks the booking
  await sendBookingConfirmation({ contactEmail: "guest@example.test" }, { place: "x" });
  assert.equal(sent.length, 1);
  bookingConfirmationMailer.send.mock.mockImplementation(async () => { throw new Error("SMTP down"); });
  t.mock.method(console, "error", () => {});
  await assert.doesNotReject(sendBookingConfirmation({ bookingCode: "NF-AAAAAA", contactEmail: "g@example.test", startDate: days(1), endDate: days(2), amount: 1 }, { place: "x" }));
});

test("a guest can change their arrival time before check-in, and the hotel is told", async (t) => {
  const rental = { _id: id(), customer: { _id: CUSTOMER, firstName: "Esi", lastName: "A" }, owner: id(), ownerType: "agent", hotelId: id(), property: { _id: id(), title: "Palm Hotel" }, roomName: "Deluxe", pricePeriod: "night", status: "confirmed", paymentStatus: "due", startDate: days(2), endDate: days(4), arrivalTime: "14:00", bookingCode: "NF-7KQ9PX", contactName: "Esi A", history: [], toJSON() { return { ...this }; } };
  const updates = [];
  const notes = [];
  t.mock.method(Rental, "findOne", () => query(rental));
  t.mock.method(Rental, "findById", () => query(() => rental));
  t.mock.method(Rental, "updateOne", async (filter, update) => { updates.push({ filter, update }); Object.assign(rental, update.$set); return {}; });
  t.mock.method(Property, "findById", () => query(hotel()));
  t.mock.method(Notification, "create", async (doc) => { notes.push(doc); return doc; });
  const req = (arrivalTime) => ({ user: { _id: CUSTOMER, role: "user" }, params: { id: String(rental._id) }, body: { arrivalTime } });

  const res = response();
  await updateArrivalTime(req("18:30"), res);
  assert.equal(res.statusCode, 200, res.body?.message);
  assert.equal(rental.arrivalTime, "18:30");
  assert.equal(String(updates[0].filter.customer), String(CUSTOMER), "only the guest's own booking");
  assert.match(notes.at(-1).message, /will now arrive on .* at 18:30 \(was 14:00\) · booking NF-7KQ9PX/);
  await assert.rejects(updateArrivalTime(req("23:00"), response()), /arrive by 20:00/);
  // Not after the check-in day, and not for cancelled or finished stays
  Object.assign(rental, { startDate: days(-1) });
  const late = response();
  await updateArrivalTime(req("16:00"), late);
  assert.equal(late.statusCode, 409);
  Object.assign(rental, { startDate: days(2), status: "cancelled" });
  const cancelled = response();
  await updateArrivalTime(req("16:00"), cancelled);
  assert.equal(cancelled.statusCode, 409);
});
