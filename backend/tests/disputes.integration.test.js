import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { adminEntryHeaders } from "./support/customerTab.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Refund from "../models/Refund.js";
import Dispute from "../models/Dispute.js";
import Setting from "../models/Setting.js";
import Notification from "../models/Notification.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

const KEYS = ["JWT_KEY", "PAYSTACK_MODE", "PAYSTACK_SECRET_KEY", "Test_Secret_Key", "CRON_SECRET", "PUBLIC_SITE_URL"];
const HOUR = 60 * 60 * 1000;

test("Paystack disputes are followed, reported to admins and block double refunds", { skip: process.env.RUN_DISPUTE_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  t.after(() => { for (const key of KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
  delete process.env.Test_Secret_Key;
  Object.assign(process.env, { JWT_KEY: "isolated-dispute-signing-key-at-least-32-characters", PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_isolated_disputes", CRON_SECRET: "isolated-dispute-recovery-secret-at-least-32-chars", PUBLIC_SITE_URL: "http://localhost:5173" });
  await isolatedMongo(t);
  await Setting.create({ key: "platform", notifications: { payments: false } }); // dispute alerts are critical: always delivered
  const admin = await User.create({ emailVerifiedAt: new Date(), firstName: "Test", lastName: "Admin", email: "admin@dispute.test", password: "test-password", role: "admin" });
  const customer = await User.create({ emailVerifiedAt: new Date(), firstName: "Test", lastName: "Guest", email: "guest@dispute.test", phone: "0241234567", password: "test-password" });
  const listing = await Property.create({ title: "Dispute test rental", propertyType: "Apartment", listingType: "Rent", price: 100, pricePeriod: "month", owner: admin._id, ownerType: "admin", status: "published", availability: "Available" });
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  // Paystack's answer about each dispute; missing = Paystack can't be asked
  const provider = new Map();
  let refundsSent = 0;
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    const href = String(url);
    if (!href.startsWith("https://api.paystack.co/")) return realFetch(url, options);
    if (href.includes("/dispute/")) {
      const data = provider.get(href.split("/").at(-1));
      if (!data) throw new Error("socket hang up");
      return Response.json({ status: true, data });
    }
    if (href.endsWith("/refund")) {
      refundsSent += 1;
      const body = JSON.parse(options.body);
      return Response.json({ status: true, data: { id: 9000 + refundsSent, status: "pending", amount: body.amount, currency: "GHS", transaction: { reference: body.transaction } } });
    }
    if (href.includes("/refund/")) return Response.json({ status: true, data: { id: Number(href.split("/").at(-1)), status: "pending", amount: 10000, currency: "GHS" } });
    throw new Error(`Unexpected Paystack call ${href}`);
  });
  t.mock.method(console, "error", () => {});

  const adminCookie = `admin_token=${jwt.sign({ id: admin.id, role: "admin", session: "admin" }, process.env.JWT_KEY, { expiresIn: "1h" })}`;
  const call = async (path, { method = "GET", body } = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": "admin", ...adminEntryHeaders(), Cookie: adminCookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { ...(await response.json()), code: response.status };
  };
  const webhook = async (event, data, { signature } = {}) => {
    const body = JSON.stringify({ event, data });
    const signed = signature ?? crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(body).digest("hex");
    const response = await fetch(`${base}/payments/paystack/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-paystack-signature": signed }, body });
    return { code: response.status, ...(await response.json()) };
  };
  const recover = async () => {
    const response = await fetch(`${base}/payments/reconcile`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    return { code: response.status, ...(await response.json()) };
  };

  let sequence = 0;
  const paid = async (extra = {}) => {
    const reference = `HBR-DISPUTE-${++sequence}`;
    const rental = await Rental.create({ property: listing.id, customer: customer.id, owner: admin.id, ownerType: "admin", startDate: "2030-01-01", endDate: "2030-02-01", pricePeriod: "month", unitPrice: 100, units: 1, amount: 100, contactName: "Test Guest", contactEmail: customer.email, contactPhone: "0241234567", status: "paid", paymentStatus: "paid", paymentReference: reference, paymentMethod: "Paystack" });
    const payment = await Payment.create({ kind: "rental", rental: rental.id, customer: customer.id, property: listing.id, owner: admin.id, ownerType: "admin", amount: 100, method: "Paystack", reference, status: "paid", environment: "test", paidAt: new Date(), ...extra });
    return { rental, payment };
  };
  const paystackDispute = (payment, extra = {}) => ({
    id: 358000 + sequence, refund_amount: 10000, currency: "GHS", status: "awaiting-merchant-feedback", resolution: null, domain: "test",
    transaction: { id: 1, domain: "test", status: "success", reference: payment.reference ?? payment.paymentReference, amount: 10000, currency: "GHS" },
    transaction_reference: null, category: "chargeback", dueAt: new Date(Date.now() + 24 * HOUR).toISOString(), resolvedAt: null, ...extra,
  });
  const resolved = (dispute, resolution, extra = {}) => ({ ...dispute, status: "resolved", resolution, resolvedAt: new Date().toISOString(), ...extra });
  // What Paystack holds and what it sends agree unless a test says otherwise
  const report = (event, dispute) => { provider.set(String(dispute.id), dispute); return webhook(event, dispute); };
  const alerts = (reference, title) => Notification.countDocuments({ audience: "admins", title, message: new RegExp(reference) });
  const latest = (payment) => Payment.findById(payment.id);

  await t.test("a forged dispute event is refused", async () => {
    const { payment } = await paid();
    assert.equal((await webhook("charge.dispute.create", paystackDispute(payment), { signature: "a".repeat(128) })).code, 401);
    assert.equal(await Dispute.countDocuments(), 0);
  });

  await t.test("a new dispute flags the payment and alerts admins once; the booking is untouched", async () => {
    const { payment, rental } = await paid();
    const dispute = paystackDispute(payment);
    const results = await Promise.all([report("charge.dispute.create", dispute), report("charge.dispute.create", dispute)]);
    // Simultaneous deliveries: both may succeed, or Paystack redelivers one
    assert.ok(results.some((r) => r.code === 200), JSON.stringify(results));
    assert.equal((await report("charge.dispute.create", dispute)).code, 200);
    assert.equal(await Dispute.countDocuments({ reference: payment.reference }), 1);
    const flagged = await latest(payment);
    assert.equal(flagged.disputeStatus, "open");
    assert.equal(flagged.status, "paid");
    assert.equal((await Rental.findById(rental.id)).status, "paid");
    assert.equal(await alerts(payment.reference, "Payment disputed"), 1);
    const shown = (await call("/admin/payments")).data.find((p) => p.id === payment.id);
    assert.equal(shown.dispute.outcome, "open");
    assert.equal(shown.dispute.disputedAmount, 100);
    assert.ok(shown.dispute.dueAt);
  });

  await t.test("Paystack's own answer wins over the event", async () => {
    const { payment } = await paid();
    const dispute = paystackDispute(payment);
    provider.set(String(dispute.id), resolved(dispute, "declined"));
    assert.equal((await webhook("charge.dispute.create", dispute)).code, 200);
    assert.equal((await latest(payment)).disputeStatus, "won");
  });

  await t.test("when Paystack can't be asked the signed event still raises the alert", async () => {
    const { payment } = await paid();
    assert.equal((await webhook("charge.dispute.create", paystackDispute(payment))).code, 200);
    assert.equal((await latest(payment)).disputeStatus, "open");
    assert.equal(await alerts(payment.reference, "Payment disputed"), 1);
  });

  await t.test("a late event can't reopen a closed dispute, but Paystack can", async () => {
    const { payment } = await paid();
    const dispute = paystackDispute(payment);
    await report("charge.dispute.create", dispute);
    await report("charge.dispute.resolve", resolved(dispute, "declined"));
    provider.delete(String(dispute.id));
    assert.equal((await webhook("charge.dispute.create", dispute)).code, 503, "Paystack redelivers it later");
    assert.equal((await latest(payment)).disputeStatus, "won");
    await report("charge.dispute.create", dispute);
    assert.equal((await latest(payment)).disputeStatus, "open");
    assert.equal(await alerts(payment.reference, "Payment dispute reopened"), 1);
  });

  await t.test("reminders reach admins about once a day, only while an answer is needed", async () => {
    const { payment } = await paid();
    const dispute = paystackDispute(payment);
    await report("charge.dispute.create", dispute);
    const title = "Payment dispute waiting for your answer";
    await Notification.deleteMany({});
    await report("charge.dispute.remind", dispute);
    await Notification.updateMany({}, { read: true });
    await report("charge.dispute.remind", dispute);
    assert.equal(await alerts(payment.reference, title), 1);
    await Dispute.updateOne({ reference: payment.reference }, { remindedAt: new Date(Date.now() - 21 * HOUR) });
    await report("charge.dispute.remind", dispute);
    assert.equal(await alerts(payment.reference, title), 2);
    await Dispute.updateOne({ reference: payment.reference }, { remindedAt: null });
    await report("charge.dispute.remind", { ...dispute, status: "awaiting-bank-feedback" });
    assert.equal(await alerts(payment.reference, title), 2, "nothing for NyaFie to answer");
  });

  await t.test("a lost dispute is recorded as money returned; the booking waits for an admin", async () => {
    const { payment, rental } = await paid();
    const dispute = paystackDispute(payment);
    await report("charge.dispute.create", dispute);
    await report("charge.dispute.resolve", resolved(dispute, "auto-accepted"));
    const lost = await latest(payment);
    assert.equal(lost.disputeStatus, "lost");
    assert.equal(lost.disputeLost, 100);
    assert.equal((await Rental.findById(rental.id)).status, "paid");
    assert.equal(await alerts(payment.reference, "Payment dispute lost"), 1);

    // Cancelling it now must not promise or start a second refund
    assert.equal((await call(`/rentals/${rental.id}/status`, { method: "PATCH", body: { status: "cancelled", note: "Charged back" } })).code, 200);
    assert.equal((await latest(payment)).status, "paid");
    assert.equal(await alerts(payment.reference, "Cancelled booking needs a refund"), 0);
    const told = await Notification.findOne({ recipient: customer._id, message: /already returned/ });
    assert.ok(told);
    assert.doesNotMatch(told.message, /will be refunded/);
  });

  await t.test("reports don't count money a dispute took back", async () => {
    const period = () => call("/admin/inventory");
    const before = (await period()).data.totals, dashboardBefore = (await call("/admin/dashboard")).data.revenue.total;
    const full = (await paid()).payment, fullDispute = paystackDispute(full);
    const part = (await paid()).payment, partDispute = paystackDispute(part);
    await report("charge.dispute.resolve", resolved(fullDispute, "merchant-accepted"));
    await report("charge.dispute.resolve", resolved(partDispute, "merchant-accepted", { refund_amount: 4000 }));
    assert.equal((await latest(part)).disputeLost, 40);
    const after = (await period()).data.totals;
    assert.equal(after.paid - before.paid, 60);
    assert.equal(after.refunded - before.refunded, 100);
    assert.equal((await call("/admin/dashboard")).data.revenue.total - dashboardBefore, 60);
  });

  await t.test("a disputed payment can't also be refunded through Paystack, but returned money can be recorded", async () => {
    const { payment } = await paid({ status: "refund_required" });
    const dispute = paystackDispute(payment);
    await report("charge.dispute.create", dispute);
    const refund = (extra) => call("/admin/refunds", { method: "POST", body: { source: "payment", id: payment.id, method: "paystack", ...extra } });
    const blocked = await refund();
    assert.equal(blocked.code, 409);
    assert.match(blocked.message, /disputed/);
    assert.equal(refundsSent, 0);
    await report("charge.dispute.resolve", resolved(dispute, "declined"));
    assert.equal((await refund()).code, 201, "won: the customer is still owed the refund");
    assert.equal(refundsSent, 1);

    const second = (await paid({ status: "refund_required" })).payment, lost = paystackDispute(second);
    await report("charge.dispute.resolve", resolved(lost, "auto-accepted"));
    const body = { source: "payment", id: second.id };
    assert.equal((await call("/admin/refunds", { method: "POST", body: { ...body, method: "paystack" } })).code, 409);
    assert.equal((await call("/admin/refunds", { method: "POST", body: { ...body, method: "manual", reason: "Returned by the bank through a dispute", externalReference: `DISPUTE-${lost.id}` } })).code, 201);
    assert.equal(refundsSent, 1);
    assert.equal(await Refund.countDocuments({ payment: second.id }), 1);
  });

  await t.test("an alert about a payment that is already refunded says so", async () => {
    const { payment } = await paid({ status: "refunded", refundStatus: "processed" });
    await report("charge.dispute.create", paystackDispute(payment));
    assert.ok(await Notification.exists({ audience: "admins", title: "Payment disputed", message: /refund of it is already recorded/ }));
  });

  await t.test("a disputed subscription keeps its plan until an admin acts", async () => {
    const agent = await User.create({ emailVerifiedAt: new Date(), firstName: "Test", lastName: "Agent", email: "agent@dispute.test", password: "test-password", role: "agent" });
    const plan = await Plan.create({ name: "Dispute plan", price: 100, duration: 30, propertyLimit: 5, imageLimit: 5 });
    const subscription = await Subscription.create({ user: agent.id, plan: plan.id, planName: plan.name, amount: 100, paymentReference: `HB-DISPUTE-${++sequence}`, paymentStatus: "paid", status: "active", startDate: new Date(), expiresAt: new Date(Date.now() + 30 * 24 * HOUR), environment: "test" });
    const dispute = paystackDispute(subscription);
    await report("charge.dispute.create", dispute);
    await report("charge.dispute.resolve", resolved(dispute, "auto-accepted"));
    const after = await Subscription.findById(subscription.id);
    assert.equal(after.disputeStatus, "lost");
    assert.equal(after.disputeLost, 100);
    assert.equal(after.status, "active");
    assert.equal(after.paymentStatus, "paid");
    assert.ok(await Notification.exists({ audience: "admins", title: "Payment dispute lost", message: /The plan it paid for was not changed/ }));
    assert.equal((await call("/admin/subscriptions")).data.find((s) => s.id === subscription.id).dispute.outcome, "lost");
  });

  await t.test("two disputes over one payment: the open one is shown and the loss never exceeds the payment", async () => {
    const { payment } = await paid();
    const first = paystackDispute(payment), second = { ...first, id: first.id + 500000 };
    await report("charge.dispute.resolve", resolved(first, "auto-accepted"));
    await report("charge.dispute.create", second);
    assert.equal((await latest(payment)).disputeStatus, "open");
    await report("charge.dispute.resolve", resolved(second, "auto-accepted"));
    const both = await latest(payment);
    assert.equal(both.disputeStatus, "lost");
    assert.equal(both.disputeLost, 100);
  });

  await t.test("an outcome NyaFie doesn't know is left to an admin and blocks refunds", async () => {
    const { payment } = await paid({ status: "refund_required" });
    await report("charge.dispute.resolve", resolved(paystackDispute(payment), "arbitration"));
    const unknown = await latest(payment);
    assert.equal(unknown.disputeStatus, "check");
    assert.equal(unknown.disputeLost, 0);
    assert.equal(await alerts(payment.reference, "Payment dispute needs checking"), 1);
    assert.equal((await call("/admin/refunds", { method: "POST", body: { source: "payment", id: payment.id, method: "paystack" } })).code, 409);
  });

  await t.test("disputes over other transactions, the other mode or with bad data are ignored", async () => {
    const { payment } = await paid();
    const count = await Dispute.countDocuments();
    assert.equal((await webhook("charge.dispute.create", paystackDispute({ reference: "SOMEONE-ELSE" }))).data.ignored, true);
    assert.equal((await webhook("charge.dispute.create", paystackDispute(payment, { domain: "live" }))).data.ignored, true);
    assert.equal((await webhook("charge.dispute.create", { id: { $ne: null }, transaction: { reference: payment.reference } })).data.ignored, true);
    const live = (await paid({ environment: "live" })).payment;
    assert.equal((await webhook("charge.dispute.create", paystackDispute(live))).data.ignored, true);
    // Paystack says this dispute is about a different payment
    const event = paystackDispute(payment);
    provider.set(String(event.id), paystackDispute({ reference: "SOMEONE-ELSE" }));
    assert.equal((await webhook("charge.dispute.create", event)).data.ignored, true);
    assert.equal(await Dispute.countDocuments(), count);
  });

  await t.test("scheduled recovery finds a result whose webhook never arrived", async () => {
    await Dispute.updateMany({}, { nextReconcileAt: new Date(Date.now() + HOUR) });
    const { payment } = await paid();
    const dispute = paystackDispute(payment);
    await report("charge.dispute.create", dispute);
    const first = await recover();
    assert.equal(first.code, 200, JSON.stringify(first));
    assert.equal(first.data.disputes.pending, 1);
    provider.set(String(dispute.id), resolved(dispute, "auto-accepted"));
    await Dispute.updateOne({ reference: payment.reference }, { nextReconcileAt: null });
    assert.equal((await recover()).data.disputes.review, 1);
    assert.equal((await latest(payment)).disputeStatus, "lost");
    assert.equal(await alerts(payment.reference, "Payment dispute lost"), 1);
  });
});
