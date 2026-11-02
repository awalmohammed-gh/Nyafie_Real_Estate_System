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

test("regular rental inventory: real HTTP, MongoDB transactions and competing payments", { skip: process.env.RUN_RENTAL_INTEGRATION !== "1", timeout: 90000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-rental-test-signing-key-long-enough";
  process.env.Test_Secret_Key = "sk_test_isolated_rental";
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
    const token = jwt.sign({ id: user.id, role: user.role, session, ...customerTabClaims(session) }, process.env.JWT_KEY);
    const response = await fetch(`${base}${path}`, { method, headers: { ...customerTabHeaders(session), "Content-Type": "application/json", "X-Session-Domain": session, Cookie: `${session}_token=${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { code: response.status, ...(await response.json()) };
  };
  const property = () => Property.create({ title: "Test apartment", propertyType: "Apartment", listingType: "Rent", price: 100, pricePeriod: "month", owner: owner._id, ownerType: "admin", status: "published", availability: "Available" });
  const request = async (listing, user = customers[0], dates = {}) => {
    const response = await api("/rentals", { user, body: { propertyId: listing.id, startDate: "2030-01-01", endDate: "2030-02-01", fullName: "Test Guest", email: user.email, phone: user.phone, currentAddress: "12 Test Road", ...dates } });
    assert.equal(response.code, 201, JSON.stringify(response));
    return response.data;
  };
  const checkout = (booking, user = customers[0]) => api("/payments/initialize", { user, body: { rentalId: booking.id } });
  const verify = (reference, user = customers[0]) => api(`/payments/verify/${reference}`, { user });
  const expire = (booking) => Rental.updateOne({ _id: booking.id }, { paymentStartedAt: new Date(Date.now() - 31 * 60000) });

  await t.test("simultaneous overlapping checkouts grant only one hold and start one provider checkout", async () => {
    const listing = await property();
    const a = await request(listing), b = await request(listing, customers[1]);
    const before = providerInitializations;
    const results = await Promise.all([checkout(a), checkout(b, customers[1])]);
    assert.deepEqual(results.map((r) => r.code).sort(), [200, 409]);
    assert.equal(providerInitializations - before, 1);
    assert.equal(await Rental.countDocuments({ property: listing._id, status: "payment_pending" }), 1);
    assert.equal(await Payment.countDocuments({ property: listing._id }), 1);
  });

  await t.test("double-clicking checkout reuses or waits for the single payment being prepared", async () => {
    const listing = await property(), booking = await request(listing);
    const before = providerInitializations;
    const results = await Promise.all([checkout(booking), checkout(booking)]);
    assert.ok(results.some((r) => r.code === 200));
    assert.ok(results.every((r) => [200, 409].includes(r.code)));
    assert.equal(providerInitializations - before, 1);
    assert.equal(await Payment.countDocuments({ rental: booking.id }), 1);
    assert.equal((await checkout(booking)).code, 200);
    assert.equal(providerInitializations - before, 1);
  });

  await t.test("late payment after an expired hold cannot overlap another paid booking", async () => {
    const listing = await property(), a = await request(listing);
    const first = await checkout(a);
    await expire(a);
    const b = await request(listing, customers[1]), second = await checkout(b, customers[1]);
    assert.equal((await verify(second.data.reference, customers[1])).code, 200);
    const late = await verify(first.data.reference);
    assert.equal(late.code, 409);
    assert.match(late.message, /refund/i);
    assert.equal((await Payment.findOne({ reference: first.data.reference })).status, "refund_required");
    assert.equal((await Rental.findById(a.id)).status, "cancelled");
    assert.equal(await Rental.countDocuments({ property: listing._id, paymentStatus: "paid" }), 1);
    assert.equal((await verify(first.data.reference)).code, 409);
  });

  await t.test("two successful charges verified simultaneously can create only one paid booking", async () => {
    const listing = await property(), a = await request(listing);
    const first = await checkout(a); await expire(a);
    const b = await request(listing, customers[1]), second = await checkout(b, customers[1]); await expire(b);
    const results = await Promise.all([verify(first.data.reference), verify(second.data.reference, customers[1])]);
    assert.deepEqual(results.map((r) => r.code).sort(), [200, 409]);
    assert.equal(await Rental.countDocuments({ property: listing._id, paymentStatus: "paid" }), 1);
    assert.equal(await Payment.countDocuments({ property: listing._id, status: "refund_required" }), 1);
  });

  await t.test("a late charge respects another customer's live hold even before that customer pays", async () => {
    const listing = await property(), a = await request(listing);
    const first = await checkout(a); await expire(a);
    const b = await request(listing, customers[1]);
    assert.equal((await checkout(b, customers[1])).code, 200);
    assert.equal((await verify(first.data.reference)).code, 409);
    assert.equal((await Rental.findById(b.id)).status, "payment_pending");
  });

  await t.test("editing dates after checkout creates a separate request and preserves the original hold", async () => {
    const listing = await property(), a = await request(listing);
    assert.equal((await checkout(a)).code, 200);
    assert.equal((await request(listing)).id, a.id, "same terms resume the existing booking");
    const b = await request(listing, customers[0], { startDate: "2030-01-15", endDate: "2030-02-15" });
    assert.notEqual(b.id, a.id);
    assert.equal((await Rental.findById(a.id)).startDate.toISOString().slice(0, 10), "2030-01-01");
    assert.equal((await checkout(b)).code, 409, "the same customer's other live hold still occupies the dates");
  });

  await t.test("back-to-back rentals are allowed when one starts on the other's end date", async () => {
    const listing = await property(), a = await request(listing);
    const first = await checkout(a);
    assert.equal((await verify(first.data.reference)).code, 200);
    const b = await request(listing, customers[1], { startDate: "2030-02-01", endDate: "2030-03-01" });
    const second = await checkout(b, customers[1]);
    assert.equal(second.code, 200);
    assert.equal((await verify(second.data.reference, customers[1])).code, 200);
    assert.equal(await Rental.countDocuments({ property: listing._id, paymentStatus: "paid" }), 2);
  });

  await t.test("an expired hold can still complete if nobody else has reserved its dates", async () => {
    const listing = await property(), booking = await request(listing);
    const started = await checkout(booking); await expire(booking);
    assert.equal((await verify(started.data.reference)).code, 200);
    assert.equal((await Rental.findById(booking.id)).paymentStatus, "paid");
  });

  await t.test("completed rentals still protect their dates against another late payment", async () => {
    const listing = await property(), a = await request(listing);
    const first = await checkout(a); await expire(a);
    const b = await request(listing, customers[1]), second = await checkout(b, customers[1]);
    assert.equal((await verify(second.data.reference, customers[1])).code, 200);
    await Rental.updateOne({ _id: b.id }, { status: "completed" });
    assert.equal((await verify(first.data.reference)).code, 409);
  });

  await t.test("owner status changes cannot restore a cancelled rental to an occupying state", async () => {
    const listing = await property(), booking = await request(listing);
    const started = await checkout(booking);
    assert.equal((await verify(started.data.reference)).code, 200);
    assert.equal((await api(`/rentals/${booking.id}/status`, { user: owner, method: "PATCH", body: { status: "cancelled" } })).code, 200);
    assert.equal((await api(`/rentals/${booking.id}/status`, { user: owner, method: "PATCH", body: { status: "confirmed" } })).code, 400);
    assert.equal((await Rental.findById(booking.id)).status, "cancelled");
  });

  await t.test("successful payment after owner cancellation remains cancelled and requires a refund", async () => {
    const listing = await property(), booking = await request(listing);
    const started = await checkout(booking);
    assert.equal((await api(`/rentals/${booking.id}/status`, { user: owner, method: "PATCH", body: { status: "cancelled" } })).code, 200);
    assert.equal((await verify(started.data.reference)).code, 409);
    assert.equal((await Rental.findById(booking.id)).status, "cancelled");
    assert.equal((await Payment.findOne({ reference: started.data.reference })).status, "refund_required");
  });

  await t.test("repairing an old paid-ledger record still checks whether its dates have been taken", async () => {
    const listing = await property(), a = await request(listing);
    const first = await checkout(a); await expire(a);
    await Payment.updateOne({ reference: first.data.reference }, { status: "paid", paidAt: new Date() });
    const b = await request(listing, customers[1]), second = await checkout(b, customers[1]);
    assert.equal((await verify(second.data.reference, customers[1])).code, 200);
    assert.equal((await verify(first.data.reference)).code, 409);
    assert.equal(await Rental.countDocuments({ property: listing._id, paymentStatus: "paid" }), 1);
  });

  await t.test("failure after saving the booking rolls back both records in real MongoDB", async (st) => {
    const listing = await property(), booking = await request(listing);
    const started = await checkout(booking);
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

  await t.test("payment for a property made unavailable cannot create a paid booking", async () => {
    const listing = await property(), booking = await request(listing);
    const started = await checkout(booking);
    await Property.updateOne({ _id: listing._id }, { availability: "Rented" });
    assert.equal((await verify(started.data.reference)).code, 409);
    assert.equal((await Rental.findById(booking.id)).status, "cancelled");
    assert.equal((await Payment.findOne({ reference: started.data.reference })).status, "refund_required");
  });
});
