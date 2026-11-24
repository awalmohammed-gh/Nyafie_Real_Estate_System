import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Rental from "../models/Rental.js";
import Property from "../models/Property.js";
import Payment from "../models/Payment.js";
import Notification from "../models/Notification.js";
import { approvalDeadline, checkInTime, expireUnansweredBookings, isAwaitingApproval } from "../utils/bookingExpiry.js";

const id = () => new mongoose.Types.ObjectId();
const HOUR = 3600000;
const query = (value) => {
  const chain = { then: (yes, no) => Promise.resolve(typeof value === "function" ? value() : value).then(yes, no) };
  for (const name of ["populate", "select", "lean", "session", "sort", "limit"]) chain[name] = () => chain;
  return chain;
};

test("a hotel must approve by 24 hours before check-in; last-minute bookings get 2 hours", () => {
  const booking = { startDate: new Date("2030-06-10T00:00:00Z"), arrivalTime: "15:00", createdAt: new Date("2030-06-01T09:00:00Z") };
  assert.equal(checkInTime(booking).toISOString(), "2030-06-10T15:00:00.000Z");
  assert.equal(approvalDeadline(booking).toISOString(), "2030-06-09T15:00:00.000Z");
  assert.equal(checkInTime({ startDate: booking.startDate }).toISOString(), "2030-06-10T12:00:00.000Z", "noon when no arrival time was given");
  // Booked 10 hours before check-in: 2 hours to answer
  assert.equal(approvalDeadline({ ...booking, createdAt: new Date("2030-06-10T05:00:00Z") }).toISOString(), "2030-06-10T07:00:00.000Z");
  // Booked an hour before check-in: until check-in, never later
  assert.equal(approvalDeadline({ ...booking, createdAt: new Date("2030-06-10T14:00:00Z") }).toISOString(), "2030-06-10T15:00:00.000Z");
});

test("only hotel bookings still waiting for the hotel can expire", () => {
  const hotelId = id();
  assert.equal(isAwaitingApproval({ hotelId, status: "confirmed", paymentOption: "on_arrival" }), true);
  assert.equal(isAwaitingApproval({ hotelId, status: "paid" }), true);
  assert.equal(isAwaitingApproval({ hotelId, status: "confirmed", paymentOption: "on_arrival", approvedAt: new Date() }), false);
  assert.equal(isAwaitingApproval({ hotelId, status: "active" }), false);
  assert.equal(isAwaitingApproval({ status: "confirmed", paymentOption: "on_arrival" }), false, "not a hotel");
});

// Bookings in memory: what the expiry job reads, cancels and announces
const world = (t, bookings) => {
  const sent = { notifications: [], refunds: [] };
  t.mock.method(mongoose.connection, "transaction", async (work) => work({ id: "session" }));
  t.mock.method(Property, "findOneAndUpdate", () => query({ _id: id() }));
  t.mock.method(Rental, "find", () => query(bookings.map((booking) => ({ ...booking }))));
  t.mock.method(Rental, "findById", (bookingId) => query(bookings.find((booking) => String(booking._id) === String(bookingId))));
  t.mock.method(Payment, "findOneAndUpdate", () => query(() => { const payment = { amount: 900, reference: "HBH-1", rental: id() }; sent.refunds.push(payment); return payment; }));
  t.mock.method(Notification, "create", async (doc) => { sent.notifications.push(doc); return doc; });
  return sent;
};
const booking = (fields) => {
  const doc = { _id: id(), hotelId: id(), customer: id(), owner: id(), ownerType: "agent", roomName: "Deluxe", numberOfRooms: 1, contactName: "Esi", status: "confirmed", paymentOption: "on_arrival", paymentStatus: "due", arrivalTime: "14:00", history: [], ...fields };
  doc.save = async () => doc;
  return doc;
};

test("unanswered bookings are cancelled at the deadline: rooms released, both sides told, online payments refunded", async (t) => {
  const now = new Date("2030-06-09T15:00:00Z");
  const overdue = booking({ startDate: new Date("2030-06-10T00:00:00Z"), arrivalTime: "14:00", createdAt: new Date("2030-06-01T00:00:00Z") });
  const paid = booking({ startDate: new Date("2030-06-10T00:00:00Z"), status: "paid", paymentStatus: "paid", paymentOption: "online", createdAt: new Date("2030-06-01T00:00:00Z") });
  const notYet = booking({ startDate: new Date("2030-06-11T00:00:00Z"), createdAt: new Date("2030-06-01T00:00:00Z") });
  const approvedMeanwhile = booking({ startDate: new Date("2030-06-10T00:00:00Z"), createdAt: new Date("2030-06-01T00:00:00Z"), approvedAt: new Date("2030-06-09T14:59:00Z") });
  const sent = world(t, [overdue, paid, notYet, approvedMeanwhile]);
  t.mock.method(console, "error", () => {});
  assert.equal(await expireUnansweredBookings({}, now), 2);
  assert.equal(overdue.status, "cancelled");
  assert.match(overdue.history.at(-1).note, /didn't approve the booking in time/);
  assert.equal(paid.status, "cancelled");
  assert.equal(sent.refunds.length, 1, "the online payment is flagged for a refund");
  assert.equal(notYet.status, "confirmed", "its deadline hasn't come");
  assert.equal(approvedMeanwhile.status, "confirmed", "approved before the deadline");
  const guests = sent.notifications.filter((n) => n.audience === "user" && n.title === "Hotel booking cancelled");
  assert.equal(guests.length, 2);
  assert.ok(guests.some((n) => /will be refunded/.test(n.message)));
  assert.ok(sent.notifications.some((n) => n.title === "Unanswered booking cancelled"));
});

test("a database problem never breaks the request that triggered the expiry", async (t) => {
  t.mock.method(Rental, "find", () => query(() => { throw new Error("database down"); }));
  t.mock.method(console, "error", () => {});
  assert.equal(await expireUnansweredBookings({ hotelId: id() }), 0);
});
