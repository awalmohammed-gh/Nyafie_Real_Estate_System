import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Property from "../models/Property.js";
import PayoutAccount from "../models/PayoutAccount.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { payoutAlertMailer } from "../utils/email.js";
import { clearBankCache, PAYOUT_HOLD_MS, payoutAccountFor, payoutActive, presentPayout, stayPaymentOptions } from "../utils/hotelPayout.js";
import { cancelPayoutChange, connectHotelPayout, disconnectHotelPayout } from "../controllers/hotelPayoutController.js";

const id = () => new mongoose.Types.ObjectId();
const OWNER = id();
const HOTEL = { _id: id(), title: "Palm Hotel", propertyType: "Hotel", listingType: "Rent", pricePeriod: "night", ownerType: "agent", owner: OWNER, currency: "GHS", stayBooking: { payOnline: true, payOnArrival: true } };
const settings = { payments: { rentalsEnabled: true } };
const query = (value) => {
  const chain = { then: (yes, no) => Promise.resolve(typeof value === "function" ? value() : value).then(yes, no) };
  for (const name of ["populate", "select", "lean", "session", "sort"]) chain[name] = () => chain;
  return chain;
};
const response = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

const withPaystack = (t) => {
  const saved = { mode: process.env.PAYSTACK_MODE, key: process.env.PAYSTACK_SECRET_KEY };
  process.env.PAYSTACK_MODE = "test"; process.env.PAYSTACK_SECRET_KEY = "sk_test_unit";
  t.after(() => { for (const [name, value] of [["PAYSTACK_MODE", saved.mode], ["PAYSTACK_SECRET_KEY", saved.key]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
};

// Paystack, the payout record, the owner's password, notifications and email, all in memory
const world = (t, stored) => {
  withPaystack(t);
  clearBankCache();
  const state = { stored, paystack: [], notifications: [], emails: [] };
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    state.paystack.push({ url: String(url), method: options.method || "GET" });
    if (String(url).includes("/bank")) return { json: async () => ({ status: true, data: [{ code: "GCB", name: "GCB Bank" }, { code: "MTN", name: "MTN Mobile Money" }] }) };
    return { json: async () => ({ status: true, data: { subaccount_code: `ACCT_${state.paystack.length}`, account_name: "PALM HOTEL LTD" } }) };
  });
  t.mock.method(Property, "findById", () => query(HOTEL));
  t.mock.method(User, "findById", () => query({ _id: OWNER, email: "owner@example.test", password: "x", matchPassword: async (value) => value === "right-password" }));
  t.mock.method(PayoutAccount, "findOne", () => query(() => state.stored));
  t.mock.method(PayoutAccount, "findOneAndUpdate", (filter, update) => query(() => {
    if (filter["pending.subaccountCode"] && state.stored?.pending?.subaccountCode !== filter["pending.subaccountCode"]) return null;
    if (filter.pending?.$exists && !state.stored?.pending) return null;
    const next = { ...(state.stored || {}), ...(update.$set || {}) };
    for (const key of Object.keys(update.$unset || {})) delete next[key];
    state.stored = next;
    return next;
  }));
  t.mock.method(Notification, "create", async (doc) => { state.notifications.push(doc); return doc; });
  t.mock.method(payoutAlertMailer, "send", async (email, alert) => { state.emails.push({ email, ...alert }); });
  return state;
};
const ownerRequest = (body = {}) => ({ user: { _id: OWNER, role: "agent" }, params: { id: String(HOTEL._id) }, body });
const details = { type: "bank", bankCode: "GCB", accountNumber: "1234567890", password: "right-password" };
const active = (fields = {}) => ({ _id: id(), property: HOTEL._id, environment: "test", type: "bank", bankCode: "GCB", bankName: "GCB Bank", accountName: "PALM", accountLast4: "1111", subaccountCode: "ACCT_old", connectedAt: new Date(0), ...fields });

test("a newly connected account receives online payments only after the 48-hour hold", async (t) => {
  const state = world(t, null);
  const before = Date.now();
  const res = response();
  await connectHotelPayout(ownerRequest(details), res);
  assert.equal(res.statusCode, 200, res.body?.message);
  const hold = state.stored.activeFrom.getTime() - before;
  assert.ok(hold >= PAYOUT_HOLD_MS - 1000 && hold <= PAYOUT_HOLD_MS + 5000);
  assert.equal(payoutActive(state.stored), false);
  assert.equal(stayPaymentOptions(HOTEL, state.stored, settings).online, false, "guests can't pay this account yet");
  assert.match(stayPaymentOptions(HOTEL, state.stored, settings).onlineProblem, /start soon/);
  assert.equal(stayPaymentOptions(HOTEL, { ...state.stored, activeFrom: new Date(Date.now() - 1) }, settings).online, true);
  assert.equal(stayPaymentOptions(HOTEL, active(), settings).online, true, "accounts from before the hold stay in use");
});

test("a change waits as a new subaccount; payments keep going to the current account", async (t) => {
  const state = world(t, active());
  const res = response();
  await connectHotelPayout(ownerRequest(details), res);
  assert.equal(res.statusCode, 200, res.body?.message);
  // Paystack: a new subaccount, never an edit of the current one
  assert.ok(state.paystack.filter((call) => call.url.includes("/subaccount")).every((call) => call.method === "POST" && !/subaccount\/ACCT_old/.test(call.url)));
  assert.equal(state.stored.subaccountCode, "ACCT_old", "the current account still receives payments");
  assert.equal(state.stored.pending.accountLast4, "7890");
  assert.ok(state.stored.pending.activeFrom > new Date(Date.now() + PAYOUT_HOLD_MS - 5000));
  assert.equal((await payoutAccountFor(HOTEL)).subaccountCode, "ACCT_old", "not promoted during the hold");
  assert.equal(presentPayout(state.stored).pending.accountLast4, "7890");
  assert.equal(JSON.stringify(presentPayout(state.stored)).includes("ACCT_"), false, "subaccount codes never reach browsers");
  // After the hold it replaces the current account, the first time anyone reads it
  const later = new Date(Date.now() + PAYOUT_HOLD_MS + 60000);
  const promoted = await payoutAccountFor(HOTEL, { now: later });
  assert.equal(promoted.accountLast4, "7890");
  assert.notEqual(promoted.subaccountCode, "ACCT_old");
  assert.equal(promoted.pending, undefined);
});

test("every payout change alerts the owner by email and in the app, and the admins", async (t) => {
  const state = world(t, active());
  await connectHotelPayout(ownerRequest(details), response());
  assert.equal(state.emails.length, 1);
  assert.equal(state.emails[0].email, "owner@example.test");
  assert.match(state.emails[0].message, /GCB Bank ending 7890/);
  assert.match(state.emails[0].message, /If you didn't ask for this, cancel the change/);
  assert.ok(state.notifications.some((n) => String(n.recipient) === String(OWNER) && n.title === "Payout account change requested"));
  assert.ok(state.notifications.some((n) => n.audience === "admins" && /payout/i.test(n.title)));
  // The owner cancels it: the current account stays, and they're told
  const res = response();
  await cancelPayoutChange(ownerRequest(), res);
  assert.equal(res.statusCode, 200, res.body?.message);
  assert.equal(state.stored.pending, undefined);
  assert.equal(state.stored.subaccountCode, "ACCT_old");
  assert.equal(state.emails.at(-1).title, "Payout account change cancelled");
  const none = response();
  await cancelPayoutChange(ownerRequest(), none);
  assert.equal(none.statusCode, 404);
});

test("a wrong password changes nothing and alerts nobody; removing the account is alerted too", async (t) => {
  const state = world(t, active());
  const res = response();
  await connectHotelPayout(ownerRequest({ ...details, password: "guess" }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(state.stored.pending, undefined);
  assert.equal(state.emails.length, 0);
  assert.equal(state.paystack.length, 0, "Paystack isn't called");
  t.mock.method(PayoutAccount, "deleteOne", async () => { state.stored = null; return {}; });
  await disconnectHotelPayout(ownerRequest(), response());
  assert.equal(state.emails.at(-1).title, "Payout account removed");
});

test("only the account owner, not agency staff, can change where the money goes", async (t) => {
  world(t, active());
  await assert.rejects(connectHotelPayout({ ...ownerRequest(details), user: { _id: id(), role: "agent" } }, response()), (error) => error.status === 403);
  await assert.rejects(cancelPayoutChange({ ...ownerRequest(), user: { _id: id(), role: "agent" } }, response()), (error) => error.status === 403);
});
