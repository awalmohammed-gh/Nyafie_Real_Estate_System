import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { adminEntryHeaders, customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Refund from "../models/Refund.js";
import Setting from "../models/Setting.js";
import Notification from "../models/Notification.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

const KEYS = ["JWT_KEY", "PAYSTACK_MODE", "PAYSTACK_SECRET_KEY", "Test_Secret_Key", "CRON_SECRET", "PUBLIC_SITE_URL"];

test("refunds of flagged payments are sent once, tracked to completion and recorded on the payment", { skip: process.env.RUN_REFUND_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  t.after(() => { for (const key of KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
  delete process.env.Test_Secret_Key;
  Object.assign(process.env, { JWT_KEY: "isolated-refund-signing-key-at-least-32-characters", PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_isolated_refunds", CRON_SECRET: "isolated-refund-recovery-secret-at-least-32-chars", PUBLIC_SITE_URL: "http://localhost:5173" });
  await isolatedMongo(t);
  await Setting.create({ key: "platform", payments: { rentalsEnabled: true } });
  const admin = await User.create({ emailVerifiedAt: new Date(), firstName: "Test", lastName: "Admin", email: "admin@refund.test", password: "test-password", role: "admin" });
  const customer = await User.create({ emailVerifiedAt: new Date(), firstName: "Test", lastName: "Guest", email: "guest@refund.test", phone: "0241234567", password: "test-password" });
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  // Paystack: charges always succeed; refunds follow `refundReply` / `refundStatus`
  const realFetch = globalThis.fetch;
  const calls = { create: 0, fetch: 0 };
  let refundReply, refundStatus = "processed", nextRefundId = 5000;
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    const href = String(url);
    if (!href.startsWith("https://api.paystack.co/")) return realFetch(url, options);
    if (href.includes("/transaction/initialize")) return Response.json({ status: true, data: { authorization_url: "https://checkout.paystack.com/refund-test" } });
    if (href.includes("/transaction/verify/")) {
      const reference = decodeURIComponent(href.split("/").at(-1));
      const record = await Payment.findOne({ reference }) || await Subscription.findOne({ paymentReference: reference });
      return Response.json({ status: true, data: { status: "success", reference, amount: Math.round(record.amount * 100), currency: "GHS", domain: "test" } });
    }
    if (href.endsWith("/refund") && options.method === "POST") {
      calls.create += 1;
      const body = JSON.parse(options.body);
      if (refundReply instanceof Error) throw refundReply;
      return Response.json(refundReply || { status: true, message: "Refund has been queued for processing", data: { id: ++nextRefundId, status: "pending", amount: body.amount, currency: "GHS", transaction: { reference: body.transaction } } });
    }
    if (href.includes("/refund/")) {
      calls.fetch += 1;
      const id = href.split("/").at(-1);
      const refund = await Refund.findOne({ providerRefundId: id });
      return Response.json({ status: true, data: { id: Number(id), status: refundStatus, amount: Math.round(refund.amount * 100), currency: "GHS" } });
    }
    throw new Error(`Unexpected Paystack call ${href}`);
  });

  const adminCookie = `admin_token=${jwt.sign({ id: admin.id, role: "admin", session: "admin" }, process.env.JWT_KEY)}`;
  const customerCookie = `customer_token=${jwt.sign({ id: customer.id, role: "user", session: "customer", ...customerTabClaims("customer") }, process.env.JWT_KEY)}`;
  const call = async (path, { method = "GET", body, as = "admin" } = {}) => {
    const headers = as === "admin" ? { "X-Session-Domain": "admin", ...adminEntryHeaders(), Cookie: adminCookie } : { ...customerTabHeaders(), "X-Session-Domain": "customer", Cookie: customerCookie };
    const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json();
    return { ...payload, code: response.status };
  };
  const webhook = async (event, data) => {
    const body = JSON.stringify({ event, data });
    const signature = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(body).digest("hex");
    const response = await fetch(`${base}/payments/paystack/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-paystack-signature": signature }, body });
    return { code: response.status, ...(await response.json()) };
  };
  const recover = async () => {
    const response = await fetch(`${base}/payments/reconcile`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    return { code: response.status, ...(await response.json()) };
  };
  const refund = (payment, extra = {}) => call("/admin/refunds", { method: "POST", body: { source: "payment", id: payment.id, method: "paystack", ...extra } });

  // A real paid booking: request, checkout, signed charge webhook
  let sequence = 0;
  const paidRental = async () => {
    const listing = await Property.create({ title: `Refund test rental ${++sequence}`, propertyType: "Apartment", listingType: "Rent", price: 100, pricePeriod: "month", owner: admin._id, ownerType: "admin", status: "published", availability: "Available" });
    const booking = await call("/rentals", { as: "customer", method: "POST", body: { propertyId: listing.id, startDate: "2030-01-01", endDate: "2030-02-01", fullName: "Test Guest", email: customer.email, phone: customer.phone, currentAddress: "12 Test Road" } });
    assert.equal(booking.code, 201, JSON.stringify(booking));
    const checkout = await call("/payments/initialize", { as: "customer", method: "POST", body: { rentalId: booking.data.id } });
    assert.equal(checkout.code, 200, JSON.stringify(checkout));
    assert.equal((await webhook("charge.success", { reference: checkout.data.reference })).code, 200);
    return { rentalId: booking.data.id, payment: await Payment.findOne({ reference: checkout.data.reference }) };
  };
  const cancelled = async () => {
    const f = await paidRental();
    const res = await call(`/rentals/${f.rentalId}/status`, { method: "PATCH", body: { status: "cancelled", note: "Owner cancelled" } });
    assert.equal(res.code, 200, JSON.stringify(res));
    return { ...f, payment: await Payment.findById(f.payment.id) };
  };

  await t.test("new checkouts record their Paystack mode", async () => {
    const f = await paidRental();
    assert.equal(f.payment.environment, "test");
    assert.equal(f.payment.status, "paid");
  });

  await t.test("cancelling a paid booking flags its charge for a refund and tells admins and the customer", async () => {
    const before = await Notification.countDocuments({ audience: "admins", title: "Cancelled booking needs a refund" });
    const f = await cancelled();
    assert.equal(f.payment.status, "refund_required");
    assert.equal(f.payment.note, "Booking cancelled after payment");
    assert.equal(await Notification.countDocuments({ audience: "admins", title: "Cancelled booking needs a refund" }), before + 1);
    assert.ok(await Notification.exists({ recipient: customer._id, message: /will be refunded/ }));
  });

  await t.test("payments that are not flagged cannot be refunded, and only admins can refund", async () => {
    const f = await paidRental();
    assert.equal((await refund(f.payment)).code, 409);
    assert.equal((await call("/admin/refunds", { as: "customer", method: "POST", body: { source: "payment", id: f.payment.id, method: "paystack" } })).code, 404, "the admin API is hidden from customers");
    assert.equal(calls.create, 0);
  });

  await t.test("a Paystack refund is sent once, even with simultaneous requests, and completes from the signed webhook", async () => {
    const f = await cancelled();
    const results = await Promise.all([refund(f.payment), refund(f.payment), refund(f.payment)]);
    assert.deepEqual(results.map((r) => r.code).sort(), [201, 409, 409], JSON.stringify(results));
    assert.equal(calls.create, 1, "Paystack receives exactly one refund request");
    const created = results.find((r) => r.code === 201).data;
    assert.equal(created.status, "pending");
    assert.equal(created.amount, f.payment.amount);
    assert.equal((await Payment.findById(f.payment.id)).refundStatus, "pending");

    const notified = await Notification.countDocuments({ recipient: customer._id, title: "Refund processed" });
    for (const status of ["processing", "processed"]) {
      assert.equal((await webhook(`refund.${status}`, { status, transaction_reference: f.payment.reference, refund_reference: null, amount: String(Math.round(f.payment.amount * 100)), currency: "GHS" })).code, 200);
    }
    const settled = await Refund.findById(created.id);
    assert.equal(settled.status, "processed");
    assert.ok(settled.processedAt);
    assert.equal((await Payment.findById(f.payment.id)).status, "refunded");
    assert.equal((await Rental.findById(f.rentalId)).paymentStatus, "refunded");
    assert.equal(await Notification.countDocuments({ recipient: customer._id, title: "Refund processed" }), notified + 1);

    // Late, repeated or out-of-order events change nothing
    await webhook("refund.processing", { status: "processing", transaction_reference: f.payment.reference, amount: String(Math.round(f.payment.amount * 100)) });
    await webhook("refund.processed", { status: "processed", transaction_reference: f.payment.reference, amount: String(Math.round(f.payment.amount * 100)) });
    assert.equal((await Refund.findById(created.id)).status, "processed");
    assert.equal(await Notification.countDocuments({ recipient: customer._id, title: "Refund processed" }), notified + 1);
    // A replayed charge can never re-confirm a refunded payment
    assert.equal((await webhook("charge.success", { reference: f.payment.reference })).code, 200);
    assert.equal((await Payment.findById(f.payment.id)).status, "refunded");
    assert.equal((await call(`/payments/verify/${f.payment.reference}`, { as: "customer" })).code, 409);
    assert.equal((await refund(f.payment)).code, 409, "a refunded payment cannot be refunded again");
  });

  await t.test("a refund event for a different amount is ignored", async () => {
    const f = await cancelled();
    const { data } = await refund(f.payment);
    assert.equal((await webhook("refund.processed", { status: "processed", transaction_reference: f.payment.reference, amount: "1" })).data.ignored, true);
    assert.equal((await Refund.findById(data.id)).status, "pending");
  });

  await t.test("a rejected refund fails, alerts admins and may be retried", async () => {
    const f = await cancelled();
    refundReply = { status: false, message: "Transaction cannot be refunded" };
    const rejected = await refund(f.payment);
    refundReply = undefined;
    assert.equal(rejected.code, 201);
    assert.equal(rejected.data.status, "failed");
    assert.match(rejected.message, /cannot be refunded/);
    assert.ok(await Notification.exists({ audience: "admins", title: "Refund failed", message: new RegExp(f.payment.reference) }));
    assert.equal((await Payment.findById(f.payment.id)).status, "refund_required", "the payment still needs a refund");
    const retry = await refund(f.payment);
    assert.equal(retry.code, 201);
    assert.equal(retry.data.status, "pending");
    assert.equal(await Refund.countDocuments({ payment: f.payment._id }), 2);
  });

  await t.test("an unanswered request is never resent and is settled by an admin from the dashboard", async (st) => {
    st.mock.method(console, "error", () => {});
    const f = await cancelled();
    refundReply = new Error("socket hang up");
    const pending = await refund(f.payment);
    refundReply = undefined;
    assert.equal(pending.data.status, "unconfirmed");
    assert.match(pending.message, /do not refund it again/);
    assert.ok(await Notification.exists({ audience: "admins", title: "Refund needs confirmation" }));
    const sent = calls.create;
    assert.equal((await refund(f.payment)).code, 409, "no second refund while the first is unconfirmed");
    await recover();
    assert.equal(calls.create, sent, "scheduled recovery never resends a refund");
    const id = pending.data.id;
    assert.equal((await call(`/admin/refunds/${id}/resolve`, { method: "POST", body: { outcome: "processed" } })).code, 400, "a note of what Paystack shows is required");
    const resolved = await call(`/admin/refunds/${id}/resolve`, { method: "POST", body: { outcome: "processed", note: "Dashboard shows refund processed on 2 Nov" } });
    assert.equal(resolved.code, 200, JSON.stringify(resolved));
    assert.equal(resolved.data.status, "processed");
    assert.equal((await Payment.findById(f.payment.id)).status, "refunded");
    assert.equal(String((await Refund.findById(id)).history.at(-1).by), admin.id);
  });

  await t.test("scheduled recovery follows accepted refunds with Paystack until they finish", async () => {
    const f = await cancelled();
    const { data } = await refund(f.payment);
    refundStatus = "processing";
    const first = await recover();
    assert.equal(first.code, 200, JSON.stringify(first));
    assert.equal((await Refund.findById(data.id)).status, "processing");
    await Refund.updateOne({ _id: data.id }, { nextReconcileAt: null });
    refundStatus = "processed";
    const second = await recover();
    assert.ok(second.data.refunds.checked >= 1);
    assert.equal((await Refund.findById(data.id)).status, "processed");
    assert.equal((await Payment.findById(f.payment.id)).status, "refunded");
    const check = await call(`/admin/refunds/${data.id}/check`, { method: "POST" });
    assert.equal(check.code, 200);
    assert.equal(check.data.status, "processed");
  });

  await t.test("a manual refund needs its transaction reference and is recorded as processed", async () => {
    const f = await cancelled();
    const sent = calls.create;
    assert.equal((await refund(f.payment, { method: "manual", reason: "Sent by mobile money" })).code, 400);
    const manual = await refund(f.payment, { method: "manual", reason: "Sent by MTN MoMo to 024xxxxxxx", externalReference: "MOMO-123456" });
    assert.equal(manual.code, 201);
    assert.equal(manual.data.status, "processed");
    assert.equal(manual.data.method, "Manual");
    assert.equal(calls.create, sent, "manual refunds never call Paystack");
    assert.equal((await Payment.findById(f.payment.id)).status, "refunded");
  });

  await t.test("a subscription payment held for a refund is refunded without touching the current plan", async () => {
    const agent = await User.create({ emailVerifiedAt: new Date(), firstName: "Test", lastName: "Agent", email: "agent@refund.test", password: "test-password", role: "agent", agentApplication: { status: "approved", agentType: "individual" } });
    const plan = await Plan.create({ name: "Refund plan", price: 80, duration: 30, propertyLimit: 5, imageLimit: 5 });
    const current = await Subscription.create({ user: agent.id, plan: plan.id, planName: plan.name, amount: 80, paymentReference: "HB-REFUND-CURRENT", paymentStatus: "paid", status: "active", startDate: new Date(), expiresAt: new Date(Date.now() + 30 * 86400000), environment: "test" });
    await User.updateOne({ _id: agent.id }, { subscription: current.id });
    const held = await Subscription.create({ user: agent.id, plan: plan.id, planName: plan.name, amount: 80, paymentReference: "HB-REFUND-HELD", paymentStatus: "refund_required", status: "cancelled", environment: "test" });
    const res = await call("/admin/refunds", { method: "POST", body: { source: "subscription", id: held.id, method: "paystack" } });
    assert.equal(res.code, 201, JSON.stringify(res));
    await webhook("refund.processed", { status: "processed", transaction_reference: held.paymentReference, amount: "8000" });
    assert.equal((await Subscription.findById(held.id)).paymentStatus, "refunded");
    assert.equal((await Subscription.findById(current.id)).status, "active");
    assert.equal(String((await User.findById(agent.id)).subscription), current.id);
    assert.ok(await Notification.exists({ recipient: agent._id, title: "Refund processed" }));
  });

  await t.test("after switching to live mode, test-mode payments are not refunded through the live account", async (st) => {
    const f = await cancelled();
    const previous = { PAYSTACK_MODE: process.env.PAYSTACK_MODE, PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY };
    st.after(() => Object.assign(process.env, previous));
    Object.assign(process.env, { PAYSTACK_MODE: "live", PAYSTACK_SECRET_KEY: "sk_live_isolated_refunds" });
    const sent = calls.create;
    const res = await refund(f.payment);
    assert.equal(res.code, 409);
    assert.match(res.message, /test mode/);
    assert.equal(calls.create, sent);
    assert.equal((await refund(f.payment, { method: "manual", reason: "Refunded from the Paystack test dashboard", externalReference: "TEST-DASH-1" })).code, 201);
  });
});
