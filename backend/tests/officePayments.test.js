import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import Property from "../models/Property.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { paysAtOffice } from "../utils/officePayments.js";
import { buildReceipt, newReceiptNumber, presentReceipt } from "../utils/receipts.js";
import { receiptMailer } from "../utils/email.js";
import { recordArrivalPayment, sendRentalReceipt, updateRentalStatus } from "../controllers/rentalController.js";
import { initializeRentalPayment } from "../controllers/paymentController.js";

const id = () => new mongoose.Types.ObjectId();
const AGENT = { _id: id(), role: "agent", firstName: "Ama", lastName: "Mensah" };
const CUSTOMER = id();

// A query that can be chained (.populate/.select/.lean/.session/.sort) and awaited
const query = (value) => {
  const chain = { then: (yes, no) => Promise.resolve(typeof value === "function" ? value() : value).then(yes, no) };
  for (const name of ["populate", "select", "lean", "session", "sort"]) chain[name] = () => chain;
  return chain;
};

// A stored rental without a database: what the controllers read, set and save
const fakeRental = (fields) => {
  const doc = {
    _id: id(), customer: { _id: CUSTOMER, firstName: "Kofi", lastName: "Boateng" }, owner: { _id: AGENT._id, firstName: "Ama", lastName: "Mensah" }, ownerType: "agent",
    property: { title: "Sea View Flat", listingType: "Rent", pricePeriod: "month", propertyType: "Apartment" },
    startDate: new Date("2031-01-01T00:00:00Z"), endDate: new Date("2031-07-01T00:00:00Z"), pricePeriod: "month",
    unitPrice: 2000, units: 6, amount: 12000, contactName: "Kofi Boateng", contactEmail: "kofi@example.test", contactPhone: "0240000000",
    status: "pending", paymentStatus: "pending", history: [], ...fields,
  };
  doc.set = (values) => Object.assign(doc, values);
  doc.save = async () => doc;
  doc.toObject = () => ({ ...doc });
  doc.toJSON = () => ({ ...doc, id: String(doc._id) });
  return doc;
};

const response = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.set = () => res;
  return res;
};

// Transactions, the property lock, conflict checks, the ledger, notifications and email, all in memory
const world = (t, rental, { conflict = false } = {}) => {
  const sent = { notifications: [], emails: [], payments: [] };
  t.mock.method(mongoose.connection, "transaction", async (work) => work({ id: "session" }));
  t.mock.method(Property, "findOneAndUpdate", () => query({ _id: id() }));
  t.mock.method(Rental, "findById", () => query(rental));
  t.mock.method(Rental, "exists", () => query(conflict ? { _id: id() } : null));
  t.mock.method(Rental, "updateOne", async () => ({}));
  t.mock.method(Payment, "create", async ([payment]) => { sent.payments.push(payment); return [{ ...payment, reference: payment.reference }]; });
  t.mock.method(User, "findById", () => query({ firstName: "Ama", lastName: "Mensah", phone: "0201112222", agentApplication: { companyName: "Mensah Homes", officeAddress: "12 Oxford St", city: "Accra" } }));
  t.mock.method(Notification, "create", async (doc) => { sent.notifications.push(doc); return doc; });
  t.mock.method(receiptMailer, "send", async (email, receipt) => { sent.emails.push({ email, receipt }); });
  return sent;
};
const owner = (body = {}, params = {}) => ({ user: AGENT, body, params: { id: String(id()), ...params }, get: () => undefined });

test("rent, houses and land are paid at the office; hotels and short stays are not", () => {
  assert.equal(paysAtOffice({ listingType: "Rent", pricePeriod: "month", propertyType: "Apartment" }), true);
  assert.equal(paysAtOffice({ listingType: "Rent", pricePeriod: "total", propertyType: "House" }), true);
  assert.equal(paysAtOffice({ listingType: "Sale", pricePeriod: "total", propertyType: "Land" }), true);
  assert.equal(paysAtOffice({ listingType: "Rent", pricePeriod: "night", propertyType: "Apartment" }), false, "short stays: online or on arrival");
  assert.equal(paysAtOffice({ listingType: "Rent", pricePeriod: "night", propertyType: "Hotel" }), false, "hotels: online or at the hotel");
  assert.equal(paysAtOffice(null), false);
});

test("monthly rent can't start an online checkout", async (t) => {
  const saved = { mode: process.env.PAYSTACK_MODE, key: process.env.PAYSTACK_SECRET_KEY };
  process.env.PAYSTACK_MODE = "test"; process.env.PAYSTACK_SECRET_KEY = "sk_test_unit";
  t.after(() => { for (const [name, value] of [["PAYSTACK_MODE", saved.mode], ["PAYSTACK_SECRET_KEY", saved.key]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  const rental = fakeRental({ property: id() });
  t.mock.method(Rental, "findOne", () => query(rental));
  t.mock.method(Property, "findById", () => query({ listingType: "Rent", pricePeriod: "month", propertyType: "Apartment" }));
  const Setting = (await import("../models/Setting.js")).default;
  t.mock.method(Setting, "findOneAndUpdate", () => query({ key: "platform", payments: { rentalsEnabled: true } }));
  const res = response();
  await initializeRentalPayment({ user: { _id: CUSTOMER }, body: { rentalId: String(rental._id) } }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /at the office/);
});

test("the owner confirms an office rental: the dates are taken and payment is due at the office", async (t) => {
  const rental = fakeRental();
  const sent = world(t, rental);
  const res = response();
  await updateRentalStatus(owner({ status: "confirmed" }), res);
  assert.equal(res.statusCode, 200, res.body?.message);
  assert.equal(rental.status, "confirmed");
  assert.equal(rental.paymentOption, "office");
  assert.equal(rental.paymentStatus, "due");
  assert.equal(rental.paymentMethod, "At the office");
  assert.match(sent.notifications.at(-1).message, /at Ama Mensah's office/);
  assert.match(sent.notifications.at(-1).message, /Never pay online or to a personal number/);
});

test("confirming fails when someone else already has the dates", async (t) => {
  const rental = fakeRental();
  world(t, rental, { conflict: true });
  await assert.rejects(updateRentalStatus(owner({ status: "confirmed" }), response()), (error) => error.status === 409);
  assert.equal(rental.status, "pending");
});

test("a tenant moves in only after the office payment is recorded", async (t) => {
  const rental = fakeRental({ status: "confirmed", paymentOption: "office", paymentStatus: "due", paymentMethod: "At the office" });
  world(t, rental);
  await assert.rejects(updateRentalStatus(owner({ status: "active" }), response()), /payment at the office before they move in/);
  const skip = response();
  await updateRentalStatus(owner({ status: "completed" }), skip);
  assert.equal(skip.statusCode, 400, "a confirmed rental can't jump to completed");
  assert.equal(rental.status, "confirmed");
});

test("recording an office payment issues the receipt, records the ledger entry and sends it", async (t) => {
  const rental = fakeRental({ status: "confirmed", paymentOption: "office", paymentStatus: "due", paymentMethod: "At the office" });
  const sent = world(t, rental);
  const res = response();
  await recordArrivalPayment(owner({ note: "Paid in cash", reference: "SLIP-77" }), res);
  assert.equal(res.statusCode, 200, res.body?.message);
  assert.equal(rental.paymentStatus, "paid");
  assert.equal(sent.payments.length, 1);
  assert.deepEqual([sent.payments[0].method, sent.payments[0].status, sent.payments[0].amount], ["Office", "paid", 12000]);
  const receipt = rental.receipt;
  assert.match(receipt.number, /^NFR-\d{8}-[0-9A-F]{8}$/);
  assert.deepEqual([receipt.amount, receipt.method, receipt.paymentReference, receipt.note], [12000, "At the office", "SLIP-77", "Paid in cash"]);
  assert.deepEqual([receipt.business, receipt.businessAddress, receipt.issuedByName, receipt.customerName], ["Mensah Homes", "12 Oxford St, Accra", "Ama Mensah", "Kofi Boateng"]);
  assert.match(receipt.description, /Sea View Flat/);
  assert.equal(sent.emails.length, 1);
  assert.equal(sent.emails[0].email, "kofi@example.test");
  assert.ok(sent.notifications.some((n) => String(n.recipient) === String(CUSTOMER) && n.title === `Receipt ${receipt.number}`));
  // Once paid it can't be recorded (or receipted) twice
  await assert.rejects(recordArrivalPayment(owner(), response()), (error) => error.status === 409);
  assert.equal(sent.payments.length, 1);
});

test("hotels: a booking paid online needs the hotel's receipt before check-in, and gets it once", async (t) => {
  const hotelId = id();
  const rental = fakeRental({ hotelId, roomName: "Deluxe", numberOfRooms: 2, pricePeriod: "night", units: 3, amount: 1800, status: "paid", paymentStatus: "paid", paymentMethod: "Paystack", paymentReference: "HBH-123", property: { title: "Palm Hotel", listingType: "Rent", pricePeriod: "night", propertyType: "Hotel" } });
  const sent = world(t, rental);
  // Confirming is fine; checking in isn't until the receipt is sent
  rental.status = "confirmed";
  await assert.rejects(updateRentalStatus(owner({ status: "active" }), response()), /receipt/);
  const res = response();
  await sendRentalReceipt(owner({ note: "Thank you" }), res);
  assert.equal(res.statusCode, 200, res.body?.message);
  assert.deepEqual([rental.receipt.method, rental.receipt.paymentReference, rental.receipt.amount], ["Online (Paystack)", "HBH-123", 1800]);
  assert.match(rental.receipt.description, /2 × Deluxe/);
  assert.equal(sent.emails.length, 1);
  await assert.rejects(sendRentalReceipt(owner(), response()), /already sent/);
  const checkIn = response();
  await updateRentalStatus(owner({ status: "active" }), checkIn);
  assert.equal(checkIn.statusCode, 200, checkIn.body?.message);
  assert.equal(rental.status, "active");
});

test("pay-at-hotel payments get their receipt when the hotel records them", async (t) => {
  const rental = fakeRental({ hotelId: id(), roomName: "Standard", numberOfRooms: 1, pricePeriod: "night", amount: 500, status: "confirmed", paymentOption: "on_arrival", paymentStatus: "due", paymentMethod: "At hotel", property: { title: "Palm Hotel", listingType: "Rent", pricePeriod: "night", propertyType: "Hotel" } });
  const sent = world(t, rental);
  await recordArrivalPayment(owner(), response());
  assert.equal(rental.paymentStatus, "paid");
  assert.equal(rental.receipt.method, "At the hotel");
  assert.equal(sent.payments.length, 0, "pay-at-hotel money isn't in the platform ledger (as before)");
  assert.equal(sent.emails.length, 1);
  // Only online payments are receipted with the separate action
  await assert.rejects(sendRentalReceipt(owner(), response()), /already sent/);
});

test("a failed receipt email doesn't undo the payment: the receipt stays in the customer's account", async (t) => {
  const rental = fakeRental({ status: "confirmed", paymentOption: "office", paymentStatus: "due", paymentMethod: "At the office" });
  const sent = world(t, rental);
  receiptMailer.send.mock.mockImplementation(async () => { throw new Error("SMTP down"); });
  t.mock.method(console, "error", () => {});
  const res = response();
  await recordArrivalPayment(owner(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(rental.paymentStatus, "paid");
  assert.ok(rental.receipt?.number);
  assert.ok(sent.notifications.some((n) => n.title === `Receipt ${rental.receipt.number}`), "still told in the app");
});

test("receipts: numbers are unique and the platform's own listings use its details", async (t) => {
  const numbers = new Set(Array.from({ length: 200 }, () => newReceiptNumber(new Date("2026-11-23T10:00:00Z"))));
  assert.equal(numbers.size, 200);
  assert.ok([...numbers].every((n) => n.startsWith("NFR-20261123-")));
  const Setting = (await import("../models/Setting.js")).default;
  t.mock.method(Setting, "findOneAndUpdate", () => query({ key: "platform", general: { siteName: "NyaFie" }, contact: { address: "Spintex, Accra", phone: "0300000000" } }));
  const receipt = await buildReceipt({ ownerType: "admin", contactName: "Esi" }, { amount: 900, method: "At the office", description: "Rent", issuer: { _id: id(), firstName: "Admin", lastName: "One" } });
  assert.equal(receipt.businessAddress, "Spintex, Accra");
  assert.equal(presentReceipt(receipt).number, receipt.number);
  assert.equal(presentReceipt(undefined), null);
});

test("house and land sales: the office payment is recorded once, with the buyer's receipt", async (t) => {
  const SaleRequest = (await import("../models/SaleRequest.js")).default;
  const Offer = (await import("../models/Offer.js")).default;
  const { confirmOfficePayment } = await import("../controllers/saleRequestController.js");
  const request = fakeRental({ askingPrice: 350000, status: "payment_pending", paymentStatus: "payment_requested", property: { title: "Plot at Oyibi", listingType: "Sale" } });
  const sent = world(t, request);
  t.mock.method(SaleRequest, "findById", () => query(request));
  t.mock.method(SaleRequest, "findOneAndUpdate", () => query(() => (request.paymentStatus === "confirmed" ? null : Object.assign(request, { paymentStatus: "confirmed" }))));
  t.mock.method(Offer, "find", () => query([]));
  const res = response();
  await confirmOfficePayment(owner({ amount: 340000, reference: "CHQ-0042" }), res);
  assert.equal(res.statusCode, 200, res.body?.message);
  assert.equal(request.status, "paid_at_office");
  assert.deepEqual([sent.payments[0].method, sent.payments[0].amount], ["Office", 340000]);
  assert.deepEqual([request.receipt.amount, request.receipt.method, request.receipt.paymentReference], [340000, "At the office", "CHQ-0042"]);
  assert.match(request.receipt.description, /Plot at Oyibi/);
  assert.equal(sent.emails.length, 1);
  // A second confirmation is refused, and nothing is recorded twice
  const again = response();
  await confirmOfficePayment(owner({ amount: 340000 }), again);
  assert.equal(again.statusCode, 400);
  assert.equal(sent.payments.length, 1);
});
