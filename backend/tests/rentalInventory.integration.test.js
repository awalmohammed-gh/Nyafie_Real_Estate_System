import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import Setting from "../models/Setting.js";
import rentalRoutes from "../routes/rentalRoutes.js";
import paymentRoutes from "../routes/paymentRoutes.js";
import { isolatedMongo } from "./support/isolatedMongo.js";
import { earlierCheckout } from "./support/earlierCheckout.js";
import { approvalDeadline, expireUnansweredBookings } from "../utils/bookingExpiry.js";

test("regular rental inventory: office rent, earlier online payments and per-night stays over real HTTP and MongoDB", { skip: process.env.RUN_RENTAL_INTEGRATION !== "1", timeout: 90000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-rental-test-signing-key-long-enough";
  // Test keys only: Paystack is never really called (fetch is replaced below)
  process.env.PAYSTACK_MODE = "test";
  process.env.PAYSTACK_SECRET_KEY = "sk_test_isolated_rental";
  process.env.PUBLIC_SITE_URL = "http://localhost:5173";
  await Setting.create({ key: "platform", payments: { rentalsEnabled: true } });
  const owner = await User.create({ emailVerifiedAt: new Date(), firstName: "Test", lastName: "Owner", email: "owner@rental.test", password: "test-password", role: "admin" });
  const customers = await User.create([1, 2].map((n) => ({ emailVerifiedAt: new Date(), firstName: "Guest", lastName: String(n), email: `guest${n}@rental.test`, phone: "0241234567", password: "test-password" })));
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/rentals", rentalRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ success: false, message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const realFetch = globalThis.fetch;
  let providerInitializations = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://api.paystack.co/")) return realFetch(url, options);
    if (String(url).includes("/initialize")) {
      providerInitializations += 1;
      return { json: async () => ({ status: true, data: { authorization_url: "https://checkout.paystack.com/rental-test" } }) };
    }
    const reference = decodeURIComponent(String(url).split("/").at(-1));
    const payment = await Payment.findOne({ reference });
    return { json: async () => ({ status: true, data: { status: "success", reference, amount: Math.round(payment.amount * 100), currency: "GHS" } }) };
  });
  const api = async (path, { user = customers[0], body, method = body ? "POST" : "GET" } = {}) => {
    const session = user.role === "admin" ? "admin" : "customer";
    const token = jwt.sign({ id: user.id, role: user.role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" });
    const response = await fetch(`${base}${path}`, { method, headers: { ...customerTabHeaders(session), "Content-Type": "application/json", "X-Session-Domain": session, Cookie: `${session}_token=${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { code: response.status, ...(await response.json()) };
  };
  const property = () => Property.create({ title: "Test apartment", propertyType: "Apartment", listingType: "Rent", price: 100, pricePeriod: "month", owner: owner._id, ownerType: "admin", status: "published", availability: "Available" });
  const request = async (listing, user = customers[0], dates = {}) => {
    const response = await api("/rentals", { user, body: { propertyId: listing.id, startDate: "2030-01-01", endDate: "2030-02-01", fullName: "Test Guest", email: user.email, phone: user.phone, currentAddress: "12 Test Road", ...dates } });
    assert.equal(response.code, 201, JSON.stringify(response));
    return response.data;
  };
  // New bookings are never paid online; this is only to prove the server refuses it
  const checkout = (booking, user = customers[0]) => api("/payments/initialize", { user, body: { rentalId: booking.id } });
  // An online payment a customer started before online rent payments were removed (support/earlierCheckout.js)
  const startedBefore = async (booking) => ({ data: { reference: (await earlierCheckout(booking.id)).reference } });
  const verify = (reference, user = customers[0]) => api(`/payments/verify/${reference}`, { user });
  const expire = (booking) => Rental.updateOne({ _id: booking.id }, { paymentStartedAt: new Date(Date.now() - 31 * 60000) });

  // ---- Monthly and fixed-price rent: confirmed by the owner, paid at the office, never online ----
  const ownerSets = (booking, path, body) => api(`/rentals/${booking.id}/${path}`, { user: owner, method: "PATCH", body });

  await t.test("rent can't be paid online: the checkout is refused and Paystack is never contacted", async () => {
    const listing = await property(), booking = await request(listing);
    assert.equal(booking.paysAtOffice, true);
    const before = providerInitializations;
    const refused = await checkout(booking);
    assert.equal(refused.code, 409);
    assert.match(refused.message, /never online/);
    assert.equal(providerInitializations, before);
    assert.equal(await Payment.countDocuments({ rental: booking.id }), 0);
    assert.equal((await Rental.findById(booking.id)).status, "pending");
  });

  await t.test("the owner confirms one request for the dates; overlapping confirmations can't both win", async () => {
    const listing = await property();
    const a = await request(listing), b = await request(listing, customers[1]);
    const results = await Promise.all([ownerSets(a, "status", { status: "confirmed" }), ownerSets(b, "status", { status: "confirmed" })]);
    assert.deepEqual(results.map((r) => r.code).sort(), [200, 409]);
    assert.equal(await Rental.countDocuments({ property: listing._id, status: "confirmed" }), 1);
    const confirmed = await Rental.findOne({ property: listing._id, status: "confirmed" });
    assert.deepEqual([confirmed.paymentOption, confirmed.paymentStatus, confirmed.paymentMethod], ["office", "due", "At the office"]);
    // The confirmed dates are taken for everyone else
    const taken = await api("/rentals", { user: customers[1], body: { propertyId: listing.id, startDate: "2030-01-10", endDate: "2030-02-10", fullName: "Late Guest", email: customers[1].email, phone: customers[1].phone, currentAddress: "12 Test Road" } });
    assert.equal(taken.code, 409);
  });

  await t.test("the tenant moves in only after the office payment is recorded, once, with a receipt", async () => {
    const listing = await property(), booking = await request(listing);
    assert.equal((await ownerSets(booking, "status", { status: "confirmed" })).code, 200);
    const early = await ownerSets(booking, "status", { status: "active" });
    assert.equal(early.code, 409);
    assert.match(early.message, /payment at the office before they move in/);
    const paid = await ownerSets(booking, "paid-at-office", { reference: "SLIP-42", note: "Cash" });
    assert.equal(paid.code, 200, JSON.stringify(paid));
    const saved = await Rental.findById(booking.id);
    assert.equal(saved.paymentStatus, "paid");
    assert.match(saved.receipt.number, /^NFR-/);
    assert.deepEqual([saved.receipt.amount, saved.receipt.method, saved.receipt.paymentReference], [100, "At the office", "SLIP-42"]);
    const ledger = await Payment.find({ rental: booking.id });
    assert.deepEqual(ledger.map((payment) => [payment.method, payment.status, payment.amount]), [["Office", "paid", 100]]);
    assert.equal((await ownerSets(booking, "paid-at-office", {})).code, 409, "only once");
    assert.equal(await Payment.countDocuments({ rental: booking.id }), 1);
    assert.equal((await ownerSets(booking, "status", { status: "active" })).code, 200);
    assert.equal((await ownerSets(booking, "status", { status: "completed" })).code, 200);
  });

  await t.test("back-to-back rentals: one may start on the other's end date", async () => {
    const listing = await property(), a = await request(listing);
    assert.equal((await ownerSets(a, "status", { status: "confirmed" })).code, 200);
    const b = await request(listing, customers[1], { startDate: "2030-02-01", endDate: "2030-03-01" });
    assert.equal((await ownerSets(b, "status", { status: "confirmed" })).code, 200);
  });

  await t.test("the tenant can cancel a request, or a confirmation not yet paid for, before move-in", async () => {
    const listing = await property(), booking = await request(listing);
    assert.equal((await ownerSets(booking, "status", { status: "confirmed" })).code, 200);
    assert.equal((await api(`/rentals/${booking.id}/cancel`, { user: customers[1], method: "PATCH", body: {} })).code, 404, "only the tenant's own");
    assert.equal((await api(`/rentals/${booking.id}/cancel`, { method: "PATCH", body: {} })).code, 200);
    assert.equal((await Rental.findById(booking.id)).status, "cancelled");
    await request(listing, customers[1]); // the dates are free again
  });

  // ---- Online payments customers started before the change: still settled safely, never double-booked ----
  await t.test("earlier payment: a late charge after an expired hold can't overlap another paid booking", async () => {
    const listing = await property(), a = await request(listing);
    const first = await startedBefore(a);
    await expire(a);
    const b = await request(listing, customers[1]), second = await startedBefore(b);
    assert.equal((await verify(second.data.reference, customers[1])).code, 200);
    const late = await verify(first.data.reference);
    assert.equal(late.code, 409);
    assert.match(late.message, /refund/i);
    assert.equal((await Payment.findOne({ reference: first.data.reference })).status, "refund_required");
    assert.equal((await Rental.findById(a.id)).status, "cancelled");
    assert.equal(await Rental.countDocuments({ property: listing._id, paymentStatus: "paid" }), 1);
    assert.equal((await verify(first.data.reference)).code, 409);
  });

  await t.test("earlier payment: two charges verified at once create only one paid booking", async () => {
    const listing = await property(), a = await request(listing);
    const first = await startedBefore(a); await expire(a);
    const b = await request(listing, customers[1]), second = await startedBefore(b); await expire(b);
    const results = await Promise.all([verify(first.data.reference), verify(second.data.reference, customers[1])]);
    assert.deepEqual(results.map((r) => r.code).sort(), [200, 409]);
    assert.equal(await Rental.countDocuments({ property: listing._id, paymentStatus: "paid" }), 1);
    assert.equal(await Payment.countDocuments({ property: listing._id, status: "refund_required" }), 1);
  });

  await t.test("earlier payment: a charge for dates the owner since confirmed for someone else is refunded", async () => {
    const listing = await property(), a = await request(listing);
    const first = await startedBefore(a); await expire(a);
    const b = await request(listing, customers[1]);
    assert.equal((await ownerSets(b, "status", { status: "confirmed" })).code, 200);
    assert.equal((await verify(first.data.reference)).code, 409);
    assert.equal((await Payment.findOne({ reference: first.data.reference })).status, "refund_required");
  });

  await t.test("earlier payment: an expired hold can still complete if nobody else has the dates", async () => {
    const listing = await property(), booking = await request(listing);
    const started = await startedBefore(booking); await expire(booking);
    assert.equal((await verify(started.data.reference)).code, 200);
    assert.equal((await Rental.findById(booking.id)).paymentStatus, "paid");
  });

  await t.test("earlier payment: completed rentals still protect their dates", async () => {
    const listing = await property(), a = await request(listing);
    const first = await startedBefore(a); await expire(a);
    const b = await request(listing, customers[1]), second = await startedBefore(b);
    assert.equal((await verify(second.data.reference, customers[1])).code, 200);
    await Rental.updateOne({ _id: b.id }, { status: "completed" });
    assert.equal((await verify(first.data.reference)).code, 409);
  });

  await t.test("earlier payment: owner status changes can't restore a cancelled rental", async () => {
    const listing = await property(), booking = await request(listing);
    const started = await startedBefore(booking);
    assert.equal((await verify(started.data.reference)).code, 200);
    assert.equal((await ownerSets(booking, "status", { status: "cancelled" })).code, 200);
    assert.equal((await ownerSets(booking, "status", { status: "confirmed" })).code, 400);
    assert.equal((await Rental.findById(booking.id)).status, "cancelled");
  });

  await t.test("earlier payment: a charge after the owner cancelled stays cancelled and is refunded", async () => {
    const listing = await property(), booking = await request(listing);
    const started = await startedBefore(booking);
    assert.equal((await ownerSets(booking, "status", { status: "cancelled" })).code, 200);
    assert.equal((await verify(started.data.reference)).code, 409);
    assert.equal((await Rental.findById(booking.id)).status, "cancelled");
    assert.equal((await Payment.findOne({ reference: started.data.reference })).status, "refund_required");
  });

  await t.test("earlier payment: repairing an old paid-ledger record still checks whether its dates were taken", async () => {
    const listing = await property(), a = await request(listing);
    const first = await startedBefore(a); await expire(a);
    await Payment.updateOne({ reference: first.data.reference }, { status: "paid", paidAt: new Date() });
    const b = await request(listing, customers[1]), second = await startedBefore(b);
    assert.equal((await verify(second.data.reference, customers[1])).code, 200);
    assert.equal((await verify(first.data.reference)).code, 409);
    assert.equal(await Rental.countDocuments({ property: listing._id, paymentStatus: "paid" }), 1);
  });

  await t.test("earlier payment: a failure after saving the booking rolls back both records in MongoDB", async (st) => {
    const listing = await property(), booking = await request(listing);
    const started = await startedBefore(booking);
    const originalSave = Payment.prototype.save;
    let failOnce = true;
    st.mock.method(Payment.prototype, "save", function (...args) {
      if (this.status === "paid" && failOnce) { failOnce = false; throw new Error("Injected payment save failure"); }
      return originalSave.apply(this, args);
    });
    assert.equal((await verify(started.data.reference)).code, 500);
    assert.equal((await Rental.findById(booking.id)).paymentStatus, "pending");
    assert.equal((await Payment.findOne({ reference: started.data.reference })).status, "pending");
    assert.equal((await verify(started.data.reference)).code, 200);
    assert.equal((await Rental.findById(booking.id)).history.filter((h) => h.note.startsWith("Paid ")).length, 1);
  });

  await t.test("earlier payment: a charge for a listing made unavailable can't create a paid booking", async () => {
    const listing = await property(), booking = await request(listing);
    const started = await startedBefore(booking);
    await Property.updateOne({ _id: listing._id }, { availability: "Rented" });
    assert.equal((await verify(started.data.reference)).code, 409);
    assert.equal((await Rental.findById(booking.id)).status, "cancelled");
    assert.equal((await Payment.findOne({ reference: started.data.reference })).status, "refund_required");
  });

  // ---- Per-night rentals: reserved with an arrival time, approved by the owner, paid on arrival ----
  const nightly = (stayBooking) => Property.create({ title: "Test short stay", propertyType: "Apartment", listingType: "Rent", price: 250, pricePeriod: "night", owner: owner._id, ownerType: "admin", status: "published", availability: "Available", ...(stayBooking ? { stayBooking } : {}) });
  const stay = { startDate: "2030-05-01", endDate: "2030-05-03", arrivalTime: "14:00" };
  const reserve = (booking, user = customers[0]) => api(`/rentals/${booking.id}/reserve`, { user, body: {} });

  await t.test("per-night rental: the guest must say when they're arriving, by the owner's deadline", async () => {
    const listing = await nightly({ arrivalDeadline: "15:00" });
    for (const arrivalTime of [undefined, "3pm", "16:30"]) {
      const response = await api("/rentals", { body: { propertyId: listing.id, ...stay, arrivalTime, fullName: "Test Guest", email: customers[0].email, phone: customers[0].phone, currentAddress: "12 Test Road" } });
      assert.equal(response.code, 400, String(arrivalTime));
    }
    assert.equal((await request(listing, customers[0], stay)).arrivalTime, "14:00");
  });

  await t.test("per-night rental: reserve, owner approval, booking receipt, then payment on arrival", async () => {
    const listing = await nightly({ arrivalDeadline: "15:00", cancellationPolicy: "Free until the day before." });
    const booking = await request(listing, customers[0], stay);
    const before = providerInitializations;
    const reserved = await reserve(booking);
    assert.equal(reserved.code, 200, JSON.stringify(reserved));
    let saved = await Rental.findById(booking.id);
    assert.deepEqual([saved.status, saved.paymentStatus, saved.paymentOption, saved.paymentMethod, saved.amount, saved.approvalRequired], ["confirmed", "due", "on_arrival", "On arrival", 500, true]);
    assert.equal(saved.arrivalDeadline.toISOString(), "2030-05-01T15:00:00.000Z");
    assert.equal(saved.bookingCode, undefined, "no booking receipt before the owner approves");
    assert.equal(reserved.data.awaitingApproval, true);
    assert.equal(providerInitializations, before, "no Paystack checkout");
    assert.equal(await Payment.countDocuments({ rental: booking.id }), 0);
    assert.equal((await reserve(booking)).message, "Reservation already confirmed");
    const taken = await api("/rentals", { user: customers[1], body: { propertyId: listing.id, ...stay, fullName: "Other Guest", email: customers[1].email, phone: customers[1].phone, currentAddress: "12 Test Road" } });
    assert.equal(taken.code, 409, "the reserved dates are held");
    assert.equal((await checkout(booking)).code, 409, "never paid online");

    const early = await ownerSets(booking, "status", { status: "active" });
    assert.equal(early.code, 409);
    assert.match(early.message, /Approve the booking/);
    assert.equal((await api(`/rentals/${booking.id}/approve`, { user: customers[0], method: "PATCH", body: {} })).code, 403, "guests can't approve");
    const approved = await ownerSets(booking, "approve", {});
    assert.equal(approved.code, 200, JSON.stringify(approved));
    saved = await Rental.findById(booking.id);
    assert.ok(saved.approvedAt);
    assert.match(saved.bookingCode, /^NF-[A-Z2-9]{6}$/);
    assert.equal((await ownerSets(booking, "approve", {})).code, 409, "only once");

    assert.equal((await ownerSets(booking, "status", { status: "active" })).code, 200);
    const unpaid = await ownerSets(booking, "status", { status: "completed" });
    assert.equal(unpaid.code, 409);
    assert.match(unpaid.message, /payment on arrival/);
    const paid = await ownerSets(booking, "paid-on-arrival", { note: "Paid by MoMo at the door" });
    assert.equal(paid.code, 200, JSON.stringify(paid));
    saved = await Rental.findById(booking.id);
    assert.deepEqual([saved.paymentStatus, saved.paymentMethod, saved.receipt.method], ["paid", "On arrival", "On arrival"]);
    assert.equal((await ownerSets(booking, "paid-on-arrival", {})).code, 409, "only once");
    assert.equal((await ownerSets(booking, "status", { status: "completed" })).code, 200);
  });

  await t.test("per-night rental: the guest may change the arrival time or cancel before check-in day", async () => {
    const listing = await nightly({ arrivalDeadline: "18:00" });
    const booking = await request(listing, customers[0], stay);
    assert.equal((await api(`/rentals/${booking.id}/cancel`, { method: "PATCH", body: {} })).code, 409, "a request that isn't reserved yet isn't cancelled online");
    assert.equal((await reserve(booking)).code, 200);
    assert.equal((await api(`/rentals/${booking.id}/arrival`, { method: "PATCH", body: { arrivalTime: "17:00" } })).code, 200);
    assert.equal((await Rental.findById(booking.id)).arrivalTime, "17:00");
    assert.equal((await api(`/rentals/${booking.id}/arrival`, { method: "PATCH", body: { arrivalTime: "19:00" } })).code, 400, "after the deadline");
    assert.equal((await api(`/rentals/${booking.id}/cancel`, { user: customers[1], method: "PATCH", body: {} })).code, 404, "only the guest's own booking");
    const cancelled = await api(`/rentals/${booking.id}/cancel`, { method: "PATCH", body: {} });
    assert.equal(cancelled.code, 200, JSON.stringify(cancelled));
    assert.equal((await Rental.findById(booking.id)).status, "cancelled");
    await request(listing, customers[1], stay);
  });

  await t.test("per-night rental: older online-only settings still take pay-on-arrival bookings, never online ones", async () => {
    const onlineOnly = await nightly({ payOnArrival: false, payOnline: true });
    const a = await request(onlineOnly, customers[0], stay);
    assert.equal((await reserve(a)).code, 200, "pay on arrival is always offered");
    const b = await request(await nightly(), customers[0], stay);
    const before = providerInitializations;
    assert.equal((await checkout(b)).code, 409);
    assert.equal(providerInitializations, before);
    const monthly = await property();
    assert.equal((await reserve(await request(monthly))).code, 409, "monthly rent is confirmed by the owner, not reserved");
  });

  await t.test("per-night rental: an unanswered reservation is cancelled 24 hours before check-in", async () => {
    const listing = await nightly();
    const booking = await request(listing, customers[0], stay);
    assert.equal((await reserve(booking)).code, 200);
    const saved = await Rental.findById(booking.id);
    assert.equal(await expireUnansweredBookings({ _id: saved._id }, new Date(approvalDeadline(saved).getTime() - 60000)), 0, "not before the deadline");
    assert.equal(await expireUnansweredBookings({ _id: saved._id }, new Date(approvalDeadline(saved).getTime() + 60000)), 1);
    assert.equal((await Rental.findById(booking.id)).status, "cancelled");
    await request(listing, customers[1], stay); // the dates are free again
  });

  await t.test("per-night rental: an earlier online payment that lapsed and was then reserved settles the reservation", async () => {
    const listing = await nightly();
    const booking = await request(listing, customers[0], stay);
    const started = await startedBefore(booking);
    const busy = await reserve(booking);
    assert.equal(busy.code, 409);
    assert.match(busy.message, /still in progress/);
    await expire(booking);
    assert.equal((await reserve(booking)).code, 200);
    const late = await verify(started.data.reference);
    assert.equal(late.code, 200, JSON.stringify(late));
    const saved = await Rental.findById(booking.id);
    assert.deepEqual([saved.status, saved.paymentStatus, saved.paymentOption, saved.paymentReference], ["confirmed", "paid", "online", started.data.reference]);
    assert.equal((await Payment.findOne({ reference: started.data.reference })).status, "paid");
    assert.equal((await ownerSets(booking, "paid-on-arrival", {})).code, 409, "nothing is due on arrival");
  });
});
