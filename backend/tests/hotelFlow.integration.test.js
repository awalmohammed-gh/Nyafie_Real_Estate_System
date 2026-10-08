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
  const directory = await mkdtemp(join(tmpdir(), "homebase-hotel-test-"));
  const log = await open(join(directory, "mongod.log"), "w");
  const binary = process.env.MONGOD_TEST_BINARY || "C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe";
  const mongod = spawn(binary, ["--dbpath", directory, "--bind_ip", "127.0.0.1", "--port", String(port), "--replSet", "hoteltest"], { stdio: ["ignore", log.fd, log.fd], windowsHide: true });
  let server;
  t.after(async () => {
    if (server) await new Promise((done) => server.close(done));
    await mongoose.disconnect();
    mongod.kill(); await new Promise((done) => mongod.exitCode !== null ? done() : mongod.once("exit", done));
    await log.close();
    const absolute = resolve(directory);
    assert.ok(absolute.startsWith(resolve(tmpdir())) && absolute.includes("homebase-hotel-test-"));
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
  process.env.Test_Secret_Key = "sk_test_isolated";
  process.env.PUBLIC_SITE_URL = "http://localhost:5173";
  await Setting.create({ key: "platform", agent: { requireSubscription: false }, property: { requireApproval: false, allowAgentPublishing: true, maxImages: 15, propertyTypes: ["Hotel", "Apartment"], rentPeriods: ["night", "month"] } });
  const owner = await User.create({ firstName: "Hotel", lastName: "Owner", email: "owner@hotel.test", phone: "0241234567", password: "test-password", role: "agent", agentApplication: { status: "approved" } });
  const stranger = await User.create({ firstName: "Other", lastName: "Agent", email: "stranger@hotel.test", phone: "0241234567", password: "test-password", role: "agent", agentApplication: { status: "approved" } });
  const customer = await User.create({ firstName: "Test", lastName: "Guest", email: "guest@hotel.test", phone: "0241234567", password: "test-password" });
  const customer2 = await User.create({ firstName: "Second", lastName: "Guest", email: "guest2@hotel.test", phone: "0241234567", password: "test-password" });
  const plan = await Plan.create({ name: "Hotel Test", price: 0, duration: 365, propertyLimit: 20, imageLimit: 15 });
  for (const agent of [owner, stranger]) {
    const subscription = await Subscription.create({ user: agent._id, plan: plan._id, planName: plan.name, amount: 0, paymentReference: `test-${agent.id}`, status: "active", paymentStatus: "waived", expiresAt: new Date("2035-01-01") });
    agent.subscription = subscription._id; await agent.save();
  }
  const tokens = (user) => { const session = user.role === "agent" ? "agent" : "customer"; return { "X-Session-Domain": session, Cookie: `${session}_token=${jwt.sign({ id: user.id, role: user.role, session }, process.env.JWT_KEY)}` }; };
  server = createApp({ initialize: async () => {} }).listen(process.env.HOTEL_UI_PREVIEW ? Number(process.env.HOTEL_UI_PORT || 4011) : 0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch;
  let providerStatus = "success";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://api.paystack.co/")) return realFetch(url, options);
    if (String(url).includes("/initialize")) return { json: async () => ({ status: true, data: { authorization_url: "https://checkout.paystack.com/isolated-test" } }) };
    const reference = decodeURIComponent(String(url).split("/").at(-1));
    const payment = await Payment.findOne({ reference });
    return { json: async () => ({ status: true, data: { reference, currency: "GHS", amount: Math.round(payment.amount * 100), status: providerStatus } }) };
  });
  const api = async (path, { user, body, method = body ? "POST" : "GET" } = {}) => {
    const response = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", ...(user ? tokens(user) : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { code: response.status, ...(await response.json()) };
  };
  const room = { name: "Deluxe Room", description: "A spacious room with a balcony and king bed.", pricePerNight: 650, quantity: 10, maxGuests: 2, beds: 1, bedType: "King bed", size: 32, sizeUnit: "sqm", images: ["/hero/furnished-bedroom.jpg"], amenities: ["Private bathroom", "Air conditioning"], active: true };
  const created = await api("/properties", { user: owner, body: { title: "Test Hotel", description: "A welcoming hotel in Accra with a pool and restaurant.", propertyType: "Hotel", listingType: "Sale", price: 1, status: "published", location: { neighbourhood: "Airport", city: "Accra", address: "1 Airport Road" }, area: 500, images: ["/hero/resort-pool.jpg"], amenities: ["Swimming pool", "Restaurant"], roomTypes: [room], owner: stranger.id } });
  assert.equal(created.code, 201, JSON.stringify(created));
  const hotelId = created.data.id, roomId = created.data.roomTypes[0].id;
  const selection = { propertyId: hotelId, roomTypeId: roomId, checkIn: "2030-01-01", checkOut: "2030-01-04", guests: 4, numberOfRooms: 2, fullName: "Test Guest", email: customer.email, phone: customer.phone, amount: 1, pricePerNight: 1, customerId: customer2.id, paymentStatus: "paid" };
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
  await t.test("checkout reserves rooms, reuses payment and rejects another customer's payment ID", async () => {
    checkout = await api("/payments/initialize", { user: customer, body: { rentalId: booking.id, amount: 1 } });
    assert.equal(checkout.code, 200, JSON.stringify(checkout)); assert.equal(checkout.data.amount, 3900);
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
  if (process.env.HOTEL_UI_PREVIEW) {
    await Property.updateOne({ _id: hotelId }, { $push: { roomTypes: { ...room, name: "Family Suite", pricePerNight: 1200, maxGuests: 4, beds: 2, bedType: "King + twin beds", size: 56, amenities: ["Kitchenette", "Private bathroom", "Balcony", "Air conditioning"], images: ["/hero/modern-living.jpg", "/hero/furnished-bedroom.jpg"] } } });
    console.log(`Isolated hotel preview: API ${base}, hotel ${hotelId}. Guest: guest@hotel.test; Agent: owner@hotel.test. Local fixture password: test-password`);
    await new Promise((done) => { const timer = setTimeout(done, 540000); process.once("SIGINT", () => { clearTimeout(timer); done(); }); });
  }
});
