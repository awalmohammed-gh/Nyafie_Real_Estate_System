import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:net";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Setting from "../models/Setting.js";
import Property from "../models/Property.js";
import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";

// Explicit opt-in: a disposable local replica set, never the configured application DB.
test("hotel marketplace: HTTP ownership, booking, payment, inventory and concurrency", { skip: process.env.RUN_HOTEL_INTEGRATION !== "1", timeout: process.env.HOTEL_UI_PREVIEW ? 600000 : 90000 }, async (t) => {
  const probe = createServer(); await new Promise((done) => probe.listen(0, "127.0.0.1", done));
  const port = probe.address().port; await new Promise((done) => probe.close(done));
  const directory = await mkdtemp(join(tmpdir(), "nyafie-hotel-test-"));
  const log = await open(join(directory, "mongod.log"), "w");
  const binary = process.env.MONGOD_TEST_BINARY || "C:/Program Files/MongoDB/Server/9.0/bin/mongod.exe";
  const mongod = spawn(binary, ["--dbpath", directory, "--bind_ip", "127.0.0.1", "--port", String(port), "--replSet", "hoteltest"], { stdio: ["ignore", log.fd, log.fd], windowsHide: true });
  let server;
  t.after(async () => {
    if (server) await new Promise((done) => server.close(done));
    await mongoose.disconnect();
    mongod.kill(); await new Promise((done) => mongod.exitCode !== null ? done() : mongod.once("exit", done));
    await log.close();
    const absolute = resolve(directory);
    assert.ok(absolute.startsWith(resolve(tmpdir())) && absolute.includes("nyafie-hotel-test-"));
    await rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  let connected = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await mongoose.connect(`mongodb://127.0.0.1:${port}/hotel_test?directConnection=true`, { serverSelectionTimeoutMS: 500, autoCreate: false, autoIndex: false }); connected = true; break; }
    catch { await delay(200); }
  }
  assert.ok(connected, "isolated MongoDB starts");
  await mongoose.connection.db.admin().command({ replSetInitiate: { _id: "hoteltest", members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
  for (let i = 0; i < 60; i++) { if ((await mongoose.connection.db.admin().command({ hello: 1 })).isWritablePrimary) break; await delay(200); }
  await Promise.all(Object.values(mongoose.models).map(async (model) => { await model.createCollection(); await model.createIndexes(); }));
  process.env.JWT_KEY = "isolated-hotel-test-jwt-secret-key";
  process.env.PAYSTACK_SECRET_KEY = "sk_test_isolated";
  process.env.PUBLIC_SITE_URL = "http://localhost:5173";
  await Setting.create({ key: "platform", agent: { requireSubscription: false }, property: { requireApproval: false, allowAgentPublishing: true, maxImages: 15, propertyTypes: ["Hotel", "Apartment", "House"], rentPeriods: ["night", "month"] } });
  const owner = await User.create({ emailVerifiedAt: new Date(), firstName: "Hotel", lastName: "Owner", email: "owner@hotel.test", phone: "0241234567", password: "test-password", role: "agent", agentApplication: { status: "approved" } });
  const stranger = await User.create({ emailVerifiedAt: new Date(), firstName: "Other", lastName: "Agent", email: "stranger@hotel.test", phone: "0241234567", password: "test-password", role: "agent", agentApplication: { status: "approved" } });
  const customer = await User.create({ emailVerifiedAt: new Date(), firstName: "Test", lastName: "Guest", email: "guest@hotel.test", phone: "0241234567", password: "test-password" });
  const customer2 = await User.create({ emailVerifiedAt: new Date(), firstName: "Second", lastName: "Guest", email: "guest2@hotel.test", phone: "0241234567", password: "test-password" });
  const plan = await Plan.create({ name: "Hotel Test", price: 0, duration: 365, propertyLimit: 20, imageLimit: 15 });
  for (const agent of [owner, stranger]) {
    const subscription = await Subscription.create({ user: agent._id, plan: plan._id, planName: plan.name, amount: 0, paymentReference: `test-${agent.id}`, status: "active", paymentStatus: "waived", expiresAt: new Date("2035-01-01") });
    agent.subscription = subscription._id; await agent.save();
  }
  const tokens = (user) => { const session = user.role === "agent" ? "agent" : "customer"; return { ...customerTabHeaders(session), "X-Session-Domain": session, Cookie: `${session}_token=${jwt.sign({ id: user.id, role: user.role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" })}` }; };
  server = createApp({ initialize: async () => {} }).listen(process.env.HOTEL_UI_PREVIEW ? Number(process.env.HOTEL_UI_PORT || 4011) : 0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch;
  let providerStatus = "success";
  const initialized = [], subaccounts = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://api.paystack.co/")) return realFetch(url, options);
    if (String(url).includes("/bank?")) return { json: async () => ({ status: true, data: String(url).includes("mobile_money") ? [{ name: "MTN Mobile Money", code: "MTN", active: true }] : [{ name: "Test Bank Ghana", code: "TBG", active: true }] }) };
    if (String(url).includes("/subaccount")) { subaccounts.push({ method: options.method, body: JSON.parse(options.body) }); return { json: async () => ({ status: true, data: { subaccount_code: "ACCT_isolated", account_name: "TEST HOTEL LTD" } }) }; }
    if (String(url).includes("/initialize")) { initialized.push(JSON.parse(options.body)); return { json: async () => ({ status: true, data: { authorization_url: "https://checkout.paystack.com/isolated-test" } }) }; }
    const reference = decodeURIComponent(String(url).split("/").at(-1));
    const payment = await Payment.findOne({ reference });
    return { json: async () => ({ status: true, data: { reference, currency: "GHS", amount: Math.round(payment.amount * 100), status: providerStatus } }) };
  });
  const api = async (path, { user, body, method = body ? "POST" : "GET" } = {}) => {
    const response = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", ...(user ? tokens(user) : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    // The HTTP status goes last: some bodies carry their own `code` (e.g. PAYMENT_PENDING)
    const payload = await response.json();
    return { ...payload, code: response.status, body: payload };
  };
  const room = { name: "Deluxe Room", description: "A spacious room with a balcony and king bed.", pricePerNight: 650, quantity: 10, maxGuests: 2, beds: 1, bedType: "King bed", size: 32, sizeUnit: "sqm", images: ["/hero/furnished-bedroom.jpg"], amenities: ["Private bathroom", "Air conditioning"], active: true };
  const created = await api("/properties", { user: owner, body: { title: "Test Hotel", description: "A welcoming hotel in Accra with a pool and restaurant.", propertyType: "Hotel", listingType: "Sale", price: 1, status: "published", location: { neighbourhood: "Airport", city: "Accra", address: "1 Airport Road" }, area: 500, images: ["/hero/resort-pool.jpg"], amenities: ["Swimming pool", "Restaurant"], roomTypes: [room], owner: stranger.id, stayBooking: { payOnArrival: true, payOnline: true, arrivalDeadline: "14:00", cancellationPolicy: "Free cancellation until the day before arrival. No-shows are charged one night." } } });
  assert.equal(created.code, 201, JSON.stringify(created));
  const hotelId = created.data.id, roomId = created.data.roomTypes[0].id;
  const selection = { propertyId: hotelId, roomTypeId: roomId, checkIn: "2030-01-01", checkOut: "2030-01-04", guests: 4, numberOfRooms: 2, fullName: "Test Guest", email: customer.email, phone: customer.phone, arrivalTime: "14:00", amount: 1, pricePerNight: 1, customerId: customer2.id, paymentStatus: "paid" };
  const book = async (user = customer, extra = {}) => api("/rentals", { user, body: { ...selection, ...extra } });
  let booking, checkout;
  await t.test("Hotel creation derives its mode, starting price and owner; guest room responses separate amenities", async () => {
    assert.equal(created.data.listingType, "Rent"); assert.equal(created.data.price, 650); assert.equal(created.data.owner, owner.id);
    const publicHotel = await api(`/properties/${hotelId}`);
    assert.deepEqual(publicHotel.data.amenities, ["Swimming pool", "Restaurant"]);
    assert.deepEqual(publicHotel.data.roomTypes[0].amenities, room.amenities);
    assert.equal(publicHotel.data.contact, undefined);
  });
  await t.test("other agents, guests and customers cannot edit rooms or book as another identity", async () => {
    assert.equal((await api(`/properties/${hotelId}`, { user: stranger, method: "PUT", body: { roomTypes: [{ ...room, id: roomId, pricePerNight: 1 }] } })).code, 403);
    assert.equal((await api(`/properties/${hotelId}`, { user: customer, method: "PUT", body: { price: 1 } })).code, 403);
    assert.equal((await api("/rentals", { body: selection })).code, 401);
    assert.equal((await book(customer, { roomTypeId: new mongoose.Types.ObjectId().toString() })).code, 400);
    assert.equal((await book(customer, { roomTypeId: undefined })).code, 400);
  });
  await t.test("booking freezes server-calculated price, room name, customer and dates", async () => {
    const response = await book(); assert.equal(response.code, 201, JSON.stringify(response)); booking = response.data;
    assert.equal(booking.totalAmount, 3900); assert.equal(booking.pricePerNight, 650); assert.equal(booking.numberOfNights, 3); assert.equal(booking.numberOfRooms, 2);
    assert.equal(booking.customerId, customer.id); assert.equal(booking.paymentStatus, "pending");
    assert.equal((await api(`/rentals/${booking.id}`, { user: customer2 })).code, 404);
  });
  await t.test("online payment waits for the hotel's own payout account; only the owner can connect it", async () => {
    const before = await api(`/properties/${hotelId}`);
    assert.equal(before.data.paymentOptions.online, false); assert.equal(before.data.paymentOptions.onArrival, true);
    assert.equal(before.data.paymentOptions.arrivalDeadline, "14:00");
    const blocked = await api("/payments/initialize", { user: customer, body: { rentalId: booking.id } });
    assert.equal(blocked.code, 409); assert.match(blocked.message, /pay at the hotel/);
    assert.equal((await api(`/properties/${hotelId}/payout`, { user: stranger })).code, 403);
    const details = { type: "bank", bankCode: "TBG", accountNumber: "0012345678901", password: "test-password" };
    assert.equal((await api(`/properties/${hotelId}/payout`, { user: owner, method: "PUT", body: { ...details, password: "wrong-password" } })).code, 400);
    assert.equal((await api(`/properties/${hotelId}/payout`, { user: owner, method: "PUT", body: { ...details, bankCode: "NOPE" } })).code, 400);
    assert.equal(subaccounts.length, 0, "nothing reaches Paystack before the password and bank are checked");
    const connected = await api(`/properties/${hotelId}/payout`, { user: owner, method: "PUT", body: details });
    assert.equal(connected.code, 200, JSON.stringify(connected));
    assert.equal(connected.data.accountLast4, "8901"); assert.equal(connected.data.bankName, "Test Bank Ghana");
    assert.ok(!JSON.stringify(connected).includes("0012345678901") && !JSON.stringify(connected).includes("ACCT_"), "no full account number or subaccount code in responses");
    assert.deepEqual(subaccounts[0], { method: "POST", body: { business_name: "Test Hotel", settlement_bank: "TBG", account_number: "0012345678901", percentage_charge: 0, description: `NyaFie hotel ${hotelId}` } });
    assert.equal((await api(`/properties/${hotelId}`)).data.paymentOptions.online, true);
    assert.equal(JSON.stringify((await api(`/properties/${hotelId}`)).data).includes("ACCT_"), false);
  });
  await t.test("checkout reserves rooms, reuses payment and rejects another customer's payment ID", async () => {
    checkout = await api("/payments/initialize", { user: customer, body: { rentalId: booking.id, amount: 1 } });
    assert.equal(checkout.code, 200, JSON.stringify(checkout)); assert.equal(checkout.data.amount, 3900);
    assert.equal(initialized.at(-1).subaccount, "ACCT_isolated", "the hotel receives the money"); assert.equal(initialized.at(-1).bearer, "subaccount");
    assert.equal((await Payment.findOne({ reference: checkout.data.reference })).subaccount, "ACCT_isolated");
    assert.equal((await api("/payments/initialize", { user: customer, body: { rentalId: booking.id } })).data.reference, checkout.data.reference);
    assert.equal((await api("/payments/initialize", { user: customer2, body: { rentalId: booking.id } })).code, 404);
    const rooms = await api(`/properties/${hotelId}/rooms?checkIn=2030-01-01&checkOut=2030-01-04`);
    assert.equal(rooms.data.rooms[0].availableRooms, 8);
  });
  await t.test("date overlap rejects excess inventory; back-to-back stays can use it", async () => {
    assert.equal((await book(customer, { numberOfRooms: 9 })).code, 409);
    assert.equal((await book(customer, { checkIn: "2030-01-04", checkOut: "2030-01-07", numberOfRooms: 10 })).code, 201);
    assert.equal((await book(customer, { guests: 5, numberOfRooms: 2 })).code, 400);
  });
  await t.test("room editing preserves identities, prohibits reserved inventory reductions and keeps old prices", async () => {
    const edit = (quantity = 10, extra = {}) => api(`/properties/${hotelId}`, { user: owner, method: "PUT", body: { roomTypes: [{ ...room, id: roomId, pricePerNight: 800, quantity, ...extra }] } });
    assert.equal((await edit(1)).code, 409);
    assert.equal((await api(`/properties/${hotelId}`, { user: owner, method: "PUT", body: { roomTypes: [] } })).code, 409);
    assert.equal((await edit()).code, 200);
    assert.equal((await Rental.findById(booking.id)).unitPrice, 650);
    assert.equal((await Property.findById(hotelId)).roomTypes[0].id, roomId);
    assert.equal((await api(`/properties/${hotelId}`, { user: owner, method: "DELETE" })).code, 409);
  });
  await t.test("provider verification is idempotent, freezes the paid snapshot and supports hotel lifecycle", async () => {
    const paid = await api(`/payments/verify/${checkout.data.reference}`, { user: customer });
    assert.equal(paid.code, 200, JSON.stringify(paid)); assert.equal(paid.data.unitPrice, 650); assert.equal(paid.data.status, "paid");
    assert.equal((await api(`/payments/verify/${checkout.data.reference}`, { user: customer })).code, 200);
    assert.equal((await api(`/rentals/${booking.id}/status`, { user: stranger, method: "PATCH", body: { status: "confirmed" } })).code, 404);
    assert.equal((await api(`/rentals/${booking.id}/status`, { user: owner, method: "PATCH", body: { status: "confirmed" } })).code, 200);
  });
  await t.test("simultaneous checkouts cannot reserve more than the remaining room inventory", async () => {
    const first = (await book(customer, { numberOfRooms: 6 })).data;
    const second = (await book(customer2, { numberOfRooms: 6 })).data;
    assert.ok(first && second);
    const results = await Promise.all([api("/payments/initialize", { user: customer, body: { rentalId: first.id } }), api("/payments/initialize", { user: customer2, body: { rentalId: second.id } })]);
    assert.deepEqual(results.map((r) => r.code).sort(), [200, 409], JSON.stringify(results));
    const occupied = await Rental.find({ hotelId, status: { $in: ["confirmed", "payment_pending"] } });
    assert.equal(occupied.reduce((sum, r) => sum + r.numberOfRooms, 0), 8);
  });
  await t.test("late provider success after an expired hold is recorded for refund without overbooking", async () => {
    const held = await Rental.findOne({ hotelId, status: "payment_pending" });
    await Rental.updateOne({ _id: held._id }, { paymentStartedAt: new Date(Date.now() - 31 * 60000) });
    const replacement = (await book(customer2, { numberOfRooms: 8 })).data;
    assert.equal((await api("/payments/initialize", { user: customer2, body: { rentalId: replacement.id } })).code, 200);
    const heldUser = String(held.customer) === customer.id ? customer : customer2;
    const late = await api(`/payments/verify/${held.paymentReference}`, { user: heldUser });
    assert.equal(late.code, 409); assert.match(late.message, /refund/);
    assert.equal((await Payment.findOne({ reference: held.paymentReference })).status, "refund_required");
    assert.equal((await Rental.findById(held.id)).status, "cancelled");
  });
  await t.test("processing provider responses keep the hold; failed payment releases it", async () => {
    const request = (await book(customer, { checkIn: "2030-04-01", checkOut: "2030-04-04" })).data;
    const checkout = (await api("/payments/initialize", { user: customer, body: { rentalId: request.id } })).data;
    providerStatus = "pending";
    assert.equal((await api(`/payments/verify/${checkout.reference}`, { user: customer })).code, 409);
    assert.equal((await Rental.findById(request.id)).status, "payment_pending");
    providerStatus = "failed";
    assert.equal((await api(`/payments/verify/${checkout.reference}`, { user: customer })).code, 402);
    assert.equal((await Rental.findById(request.id)).status, "pending");
    providerStatus = "success";
  });
  await t.test("earlier whole-hotel checkouts cannot bypass room inventory after deployment", async () => {
    const response = await book(customer, { checkIn: "2030-06-01", checkOut: "2030-06-04", numberOfRooms: 1, guests: 2 });
    assert.equal(response.code, 201, JSON.stringify(response));
    const replacement = response.data;
    assert.equal((await api("/payments/initialize", { user: customer, body: { rentalId: replacement.id } })).code, 200);
    const legacy = await Rental.create({ property: hotelId, customer: customer2._id, owner: owner._id, ownerType: "agent", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-04"), pricePeriod: "night", unitPrice: 650, units: 3, amount: 1950, contactName: "Earlier Guest", contactEmail: customer2.email, contactPhone: customer2.phone, status: "payment_pending", paymentReference: "legacy-hotel-payment", paymentStartedAt: new Date(Date.now() - 31 * 60000) });
    await Payment.create({ kind: "rental", rental: legacy._id, customer: customer2._id, property: hotelId, owner: owner._id, ownerType: "agent", amount: 1950, method: "Paystack", reference: legacy.paymentReference });
    assert.equal((await api(`/payments/verify/${legacy.paymentReference}`, { user: customer2 })).code, 409);
    assert.equal((await Payment.findOne({ reference: legacy.paymentReference })).status, "refund_required");
  });
  await t.test("reserve now, pay at the hotel: rooms are secured first, then the hotel records the payment", async () => {
    const stay = { checkIn: "2030-08-01", checkOut: "2030-08-03", numberOfRooms: 4, guests: 2 };
    const request = (await book(customer, stay)).data;
    const reserved = await api(`/rentals/${request.id}/reserve`, { user: customer, body: {} });
    assert.equal(reserved.code, 200, JSON.stringify(reserved));
    assert.equal(reserved.data.status, "confirmed"); assert.equal(reserved.data.paymentStatus, "due"); assert.equal(reserved.data.paymentOption, "on_arrival");
    assert.equal(reserved.data.arrivalDeadline, "2030-08-01T14:00:00.000Z"); assert.match(reserved.data.cancellationPolicy, /No-shows/);
    assert.equal((await api(`/rentals/${request.id}/reserve`, { user: customer, body: {} })).code, 200, "repeating is harmless");
    assert.equal((await api(`/rentals/${request.id}/reserve`, { user: customer2, body: {} })).code, 404);
    assert.equal((await api(`/properties/${hotelId}/rooms?checkIn=2030-08-01&checkOut=2030-08-03`)).data.rooms[0].availableRooms, 6, "the reservation holds its rooms");
    assert.equal((await book(customer2, { ...stay, numberOfRooms: 7 })).code, 409);
    assert.equal((await api("/payments/initialize", { user: customer, body: { rentalId: request.id } })).code, 400, "a reservation can't start a second payment");
    // The hotel's side: check in, payment must be recorded before the stay can complete
    assert.equal((await api(`/rentals/${request.id}/paid-on-arrival`, { user: stranger, method: "PATCH", body: {} })).code, 404);
    assert.equal((await api(`/rentals/${request.id}/status`, { user: owner, method: "PATCH", body: { status: "active" } })).code, 200);
    assert.equal((await api(`/rentals/${request.id}/status`, { user: owner, method: "PATCH", body: { status: "completed" } })).code, 409);
    const paid = await api(`/rentals/${request.id}/paid-on-arrival`, { user: owner, method: "PATCH", body: {} });
    assert.equal(paid.code, 200, JSON.stringify(paid)); assert.equal(paid.data.paymentStatus, "paid"); assert.equal(paid.data.paymentMethod, "At hotel");
    assert.equal((await api(`/rentals/${request.id}/paid-on-arrival`, { user: owner, method: "PATCH", body: {} })).code, 409);
    assert.equal((await api(`/rentals/${request.id}/status`, { user: owner, method: "PATCH", body: { status: "completed" } })).code, 200);
  });
  await t.test("guests cancel a pay-at-hotel reservation before check-in day, releasing the rooms", async () => {
    const request = (await book(customer2, { checkIn: "2030-09-01", checkOut: "2030-09-02", numberOfRooms: 10, guests: 2 })).data;
    assert.equal((await api(`/rentals/${request.id}/reserve`, { user: customer2, body: {} })).code, 200);
    assert.equal((await book(customer, { checkIn: "2030-09-01", checkOut: "2030-09-02", numberOfRooms: 1, guests: 1 })).code, 409);
    assert.equal((await api(`/rentals/${request.id}/cancel`, { user: customer, method: "PATCH", body: {} })).code, 404);
    const cancelled = await api(`/rentals/${request.id}/cancel`, { user: customer2, method: "PATCH", body: {} });
    assert.equal(cancelled.code, 200); assert.equal(cancelled.data.status, "cancelled");
    assert.equal((await book(customer, { checkIn: "2030-09-01", checkOut: "2030-09-02", numberOfRooms: 10, guests: 1 })).code, 201);
  });
  await t.test("an online payment that lands after the guest switched to pay at the hotel settles the reservation once", async () => {
    const request = (await book(customer, { checkIn: "2030-10-01", checkOut: "2030-10-02", numberOfRooms: 1, guests: 1 })).data;
    const started = (await api("/payments/initialize", { user: customer, body: { rentalId: request.id } })).data;
    assert.equal((await api(`/rentals/${request.id}/reserve`, { user: customer, body: {} })).code, 409, "not while the online checkout is open");
    await Rental.updateOne({ _id: request.id }, { paymentStartedAt: new Date(Date.now() - 31 * 60000) });
    assert.equal((await api(`/rentals/${request.id}/reserve`, { user: customer, body: {} })).code, 200);
    const late = await api(`/payments/verify/${started.reference}`, { user: customer });
    assert.equal(late.code, 200, JSON.stringify(late)); assert.equal(late.data.paymentStatus, "paid"); assert.equal(late.data.status, "confirmed");
    assert.equal((await Payment.findOne({ reference: started.reference })).status, "paid");
    assert.equal((await api(`/payments/verify/${started.reference}`, { user: customer })).code, 200, "verifying again changes nothing");
  });
  await t.test("each hotel chooses its options: pay-at-hotel can be switched off, and one option must stay on", async () => {
    const edit = (stayBooking) => api(`/properties/${hotelId}`, { user: owner, method: "PUT", body: { stayBooking } });
    assert.equal((await edit({ payOnArrival: false, payOnline: false })).code, 400);
    assert.equal((await edit({ arrivalDeadline: "25:00" })).code, 400);
    assert.equal((await edit({ payOnArrival: false })).code, 200);
    const request = (await book(customer, { checkIn: "2030-11-01", checkOut: "2030-11-02", numberOfRooms: 1, guests: 1 })).data;
    assert.equal((await api(`/rentals/${request.id}/reserve`, { user: customer, body: {} })).code, 409);
    assert.equal((await api(`/properties/${hotelId}/payout`, { user: owner, method: "DELETE" })).code, 200);
    assert.equal((await api("/payments/initialize", { user: customer, body: { rentalId: request.id } })).code, 409, "no payout account: no online payment");
    assert.equal((await edit({ payOnArrival: true })).code, 200);
  });
  if (process.env.HOTEL_UI_PREVIEW) {
    await Property.updateOne({ _id: hotelId }, { $push: { roomTypes: { ...room, name: "Family Suite", pricePerNight: 1200, maxGuests: 4, beds: 2, bedType: "King + twin beds", size: 56, amenities: ["Kitchenette", "Private bathroom", "Balcony", "Air conditioning"], images: ["/hero/modern-living.jpg", "/hero/furnished-bedroom.jpg"] } } });
    // A rental priced per night, to preview its "pay online or on arrival" checkout
    const shortStay = await api("/properties", { user: owner, body: { title: "Test Short Stay", description: "A furnished one-bedroom apartment for short stays near the airport.", propertyType: "Apartment", listingType: "Rent", pricePeriod: "night", price: 2500, status: "published", location: { neighbourhood: "Airport", city: "Accra", address: "3 Airport Road" }, area: 60, images: ["/hero/modern-living.jpg"], stayBooking: { payOnArrival: true, payOnline: true, arrivalDeadline: "15:00", cancellationPolicy: "Free cancellation until the day before arrival." } } });
    // A house for sale with several photos, amenities and a map pin, plus two similar homes
    const photos = ["/hero/heritage-villa.jpg", "/hero/modern-living.jpg", "/hero/furnished-bedroom.jpg", "/hero/resort-pool.jpg", "/hero/heritage-villa-960.jpg", "/hero/modern-living-960.jpg", "/hero/furnished-bedroom-960.jpg"];
    const house = (title, price, extra = {}) => api("/properties", { user: owner, body: { title, description: "A spacious and well-designed 4-bedroom house with a wrap-around terrace, modern finishes and ample parking. Located in the serene and sought-after East Legon area, it offers comfort, security and convenience for families or investors. The ground floor has an open-plan living and dining area that opens onto the terrace, a fitted kitchen with a pantry, and a guest washroom. Upstairs, every bedroom is en-suite.", propertyType: "House", listingType: "Sale", price, bedrooms: 4, bathrooms: 4, area: 450, status: "published", location: { neighbourhood: "East Legon", city: "Accra", region: "Greater Accra", address: "12 Lagos Avenue", digitalAddress: "GA-412-3381", latitude: 5.6355, longitude: -0.1617 }, images: photos, amenities: ["Air Conditioning", "Fitted Kitchen", "Borehole", "24/7 Security", "Solar Backup", "Staff Quarters", "Garden", "Walled Compound"], ...extra } });
    const saleHouse = await house("The Wrap-Around Terrace", 450000);
    await house("Four Bedroom House", 420000, { images: [photos[4], photos[1]] });
    await house("Five Bedroom Detached", 750000, { bedrooms: 5, bathrooms: 5, area: 600, images: [photos[5], photos[0]] });
    // A monthly rental with move-in costs, waiting for its availability confirmation
    const flat = await api("/properties", { user: owner, body: { title: "City Apartment", description: "A bright two bedroom apartment in East Legon with parking, security and a borehole.", propertyType: "Apartment", listingType: "Rent", pricePeriod: "month", price: 2500, bedrooms: 2, bathrooms: 2, area: 95, status: "published", location: { neighbourhood: "East Legon", city: "Accra", address: "9 Boundary Road", latitude: 5.638, longitude: -0.165 }, images: photos.slice(1, 5), amenities: ["Parking", "24/7 Security", "Borehole"], moveIn: { advanceMonths: 12, agentFeeType: "percent", agentFeeValue: 10, securityDeposit: 2500 } } });
    await Property.updateOne({ _id: flat.data?.id }, { $set: { freshnessReminderAt: new Date(), availabilityConfirmedAt: new Date(Date.now() - 35 * 864e5) } }, { timestamps: false });
    console.log(`City apartment ${flat.data?.id || JSON.stringify(flat)}`);
    console.log(`Sale house ${saleHouse.data?.id || JSON.stringify(saleHouse)}`);
    console.log(`Isolated hotel preview: API ${base}, hotel ${hotelId}, short stay ${shortStay.data?.id || JSON.stringify(shortStay)}. Guest: guest@hotel.test; Agent: owner@hotel.test. Local fixture password: test-password`);
    await new Promise((done) => { const timer = setTimeout(done, 540000); process.once("SIGINT", () => { clearTimeout(timer); done(); }); });
  }
});
