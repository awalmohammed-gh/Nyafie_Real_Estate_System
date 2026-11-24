import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import Setting from "../models/Setting.js";
import Notification from "../models/Notification.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import { reconcileOpenPayments } from "../controllers/subscriptionController.js";
import { requestRefund } from "../utils/refunds.js";
import Refund from "../models/Refund.js";
import { isolatedMongo } from "./support/isolatedMongo.js";
import { earlierCheckout } from "./support/earlierCheckout.js";

test("rental payments recover without a browser callback using signed webhooks and scheduled checks", { skip: process.env.RUN_PAYMENT_INTEGRATION !== "1", timeout: 90000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-callback-signing-key-at-least-32-characters";
  // Test keys only: Paystack is never really called (fetch is replaced below)
  process.env.PAYSTACK_MODE = "test";
  process.env.PAYSTACK_SECRET_KEY = "sk_test_isolated_callback";
  process.env.CRON_SECRET = "isolated-recovery-secret-at-least-32-characters";
  process.env.PUBLIC_SITE_URL = "http://localhost:5173";
  await Setting.create({ key: "platform", payments: { rentalsEnabled: true } });
  const owner = await User.create({ emailVerifiedAt: new Date(), firstName: "Test", lastName: "Owner", email: "owner@callback.test", password: "test-password", role: "admin" });
  const customer = await User.create({ emailVerifiedAt: new Date(), firstName: "Test", lastName: "Guest", email: "guest@callback.test", phone: "0241234567", password: "test-password" });
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const token = jwt.sign({ id: customer.id, role: "user", session: "customer", ...customerTabClaims("customer") }, process.env.JWT_KEY, { expiresIn: "1h" });
  const realFetch = globalThis.fetch;
  const provider = new Map();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://api.paystack.co/")) return realFetch(url, options);
    if (String(url).includes("/initialize")) return { json: async () => ({ status: true, data: { authorization_url: "https://checkout.paystack.com/callback-test" } }) };
    const reference = decodeURIComponent(String(url).split("/").at(-1));
    const changes = provider.get(reference);
    if (changes instanceof Error) throw changes;
    const payment = await Payment.findOne({ reference }) || await Subscription.findOne({ paymentReference: reference });
    return { json: async () => ({ status: true, data: { status: "success", reference, amount: Math.round(payment.amount * 100), currency: "GHS", ...changes } }) };
  });
  const api = async (path, body) => {
    const response = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { ...customerTabHeaders(), "Content-Type": "application/json", "X-Session-Domain": "customer", Cookie: `customer_token=${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json();
    return { ...payload, code: response.status, body: payload };
  };
  const webhook = async (reference, extra = {}) => {
    const body = JSON.stringify({ event: "charge.success", data: { reference, ...extra } });
    const signature = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(body).digest("hex");
    const response = await fetch(`${base}/payments/paystack/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-paystack-signature": signature }, body });
    return { code: response.status, ...(await response.json()) };
  };
  const recover = async () => {
    const response = await fetch(`${base}/payments/reconcile`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    return { code: response.status, ...(await response.json()) };
  };
  const start = async ({ hotel = false } = {}) => {
    const listing = await Property.create({ title: "Callback test rental", propertyType: hotel ? "Hotel" : "Apartment", listingType: "Rent", price: 100, pricePeriod: hotel ? "night" : "month", owner: owner._id, ownerType: "admin", status: "published", availability: "Available", ...(hotel ? { stayBooking: { payOnline: true }, roomTypes: [{ name: "Deluxe", bedType: "King", description: "Test room", pricePerNight: 100, quantity: 2, maxGuests: 2, beds: 1, images: ["/room.jpg"] }] } : {}) });
    const booking = await api("/rentals", { propertyId: listing.id, startDate: "2030-01-01", endDate: hotel ? "2030-01-04" : "2030-02-01", fullName: "Test Guest", email: customer.email, phone: customer.phone, currentAddress: "12 Test Road", ...(hotel ? { roomTypeId: listing.roomTypes[0].id, checkIn: "2030-01-01", checkOut: "2030-01-04", guests: 2, numberOfRooms: 1, arrivalTime: "14:00" } : {}) });
    assert.equal(booking.code, 201, JSON.stringify(booking));
    // New rent and platform-hotel bookings can't be paid online any more (the server refuses it)...
    assert.equal((await api("/payments/initialize", { rentalId: booking.data.id })).code, 409);
    // ...but payments customers started before that are still confirmed safely: those are tested here
    const { reference } = await earlierCheckout(booking.data.id);
    return { listing, booking: booking.data, reference };
  };

  await t.test("a signed webhook confirms a regular rental without any customer callback or login cookie", async () => {
    const f = await start();
    const res = await webhook(f.reference, { customer: { id: "forged" }, metadata: { rentalId: "forged" }, amount: 1 });
    assert.equal(res.code, 200);
    const rental = await Rental.findById(f.booking.id);
    assert.equal(rental.paymentStatus, "paid");
    assert.equal(String(rental.customer), customer.id);
    assert.equal((await Payment.findOne({ reference: f.reference })).status, "paid");
    const notifications = await Notification.countDocuments();
    assert.equal((await webhook(f.reference)).code, 200);
    assert.equal((await api(`/payments/verify/${f.reference}`)).code, 200);
    assert.equal((await Rental.findById(f.booking.id)).history.filter((h) => h.note.startsWith("Paid ")).length, 1);
    assert.equal(await Notification.countDocuments(), notifications, "replays do not repeat payment notifications");
  });

  await t.test("hotel room payments use the same authenticated callback without losing room inventory checks", async () => {
    const f = await start({ hotel: true });
    assert.equal((await webhook(f.reference)).code, 200);
    const rental = await Rental.findById(f.booking.id);
    assert.equal(rental.paymentStatus, "paid");
    assert.equal(rental.roomName, "Deluxe");
    assert.equal(rental.amount, 300);
    assert.equal((await webhook(f.reference)).code, 200);
    assert.equal(rental.history.filter((h) => h.note.startsWith("Hotel payment verified")).length, 1);
  });

  await t.test("scheduled recovery confirms a successful payment whose webhook and browser callback were missed", async () => {
    const f = await start();
    assert.equal((await Rental.findById(f.booking.id)).paymentStatus, "pending");
    const recovered = await recover();
    assert.equal(recovered.code, 200);
    assert.equal(recovered.data.paid, 1);
    assert.equal((await Rental.findById(f.booking.id)).paymentStatus, "paid");
    assert.equal((await recover()).data.checked, 0);
  });

  await t.test("a webhook racing a browser verification fulfills the booking once", async () => {
    const f = await start();
    const results = await Promise.all([webhook(f.reference), api(`/payments/verify/${f.reference}`)]);
    assert.ok(results.every((res) => res.code === 200));
    const rental = await Rental.findById(f.booking.id);
    assert.equal(rental.paymentStatus, "paid");
    assert.equal(rental.history.filter((h) => h.note.startsWith("Paid ")).length, 1);
  });

  await t.test("processing payments retain their hold until provider verification confirms success", async () => {
    const f = await start();
    const before = await Rental.findById(f.booking.id);
    provider.set(f.reference, { status: "pending" });
    assert.equal((await webhook(f.reference)).code, 503);
    const verification = await api(`/payments/verify/${f.reference}`);
    assert.equal(verification.code, 409);
    assert.equal(verification.body.code, "PAYMENT_PENDING");
    const after = await Rental.findById(f.booking.id);
    assert.equal(after.status, "payment_pending");
    assert.equal(after.paymentStartedAt.getTime(), before.paymentStartedAt.getTime());
    assert.equal((await Payment.findOne({ reference: f.reference })).status, "pending");
    provider.delete(f.reference);
    assert.equal((await webhook(f.reference)).code, 200);
  });

  await t.test("a signed callback alone cannot override a mismatched provider reference", async () => {
    const f = await start();
    provider.set(f.reference, { reference: "different-payment" });
    assert.equal((await webhook(f.reference)).code, 503);
    assert.equal((await Rental.findById(f.booking.id)).paymentStatus, "pending");
    provider.delete(f.reference);
    assert.equal((await webhook(f.reference)).code, 200);
  });

  await t.test("a charge Paystack reports with a different amount or currency is held for a refund, never booked", async () => {
    for (const change of [{ amount: 1 }, { amount: 99999999 }, { currency: "USD" }]) {
      const f = await start();
      provider.set(f.reference, change);
      assert.equal((await webhook(f.reference)).code, 200, "definitive: acknowledged, not retried");
      const payment = await Payment.findOne({ reference: f.reference });
      assert.equal(payment.status, "refund_required", JSON.stringify(change));
      assert.match(payment.note, /was expected\. Nothing was granted\./);
      const rental = await Rental.findById(f.booking.id);
      assert.notEqual(rental.paymentStatus, "paid");
      assert.notEqual(rental.status, "payment_pending", "the hold is released");
      // Redelivery, and a later "correct" answer, cannot turn it into a booking
      provider.delete(f.reference);
      assert.equal((await webhook(f.reference)).code, 200);
      assert.equal((await Payment.findOne({ reference: f.reference })).status, "refund_required");
      assert.notEqual((await Rental.findById(f.booking.id)).paymentStatus, "paid");
    }
  });

  await t.test("provider errors return non-200 so Paystack can redeliver the webhook", async (st) => {
    st.mock.method(console, "error", () => {});
    const f = await start();
    provider.set(f.reference, new Error("Simulated provider outage"));
    assert.equal((await webhook(f.reference)).code, 500);
    assert.equal((await Payment.findOne({ reference: f.reference })).status, "pending");
    provider.delete(f.reference);
    assert.equal((await webhook(f.reference)).code, 200);
  });

  await t.test("recovery leases prevent concurrent scheduled jobs from claiming the same payment", async () => {
    const f = await start();
    const results = await Promise.all([recover(), recover()]);
    assert.ok(results.every((res) => res.code === 200));
    assert.equal(results.reduce((total, res) => total + res.data.checked, 0), 1);
    assert.equal((await Rental.findById(f.booking.id)).paymentStatus, "paid");
  });

  await t.test("a late charge for a cancelled rental is acknowledged after recording refund review", async () => {
    const f = await start();
    await Rental.updateOne({ _id: f.booking.id }, { status: "cancelled" });
    assert.equal((await webhook(f.reference)).code, 200);
    assert.equal((await Rental.findById(f.booking.id)).status, "cancelled");
    assert.equal((await Payment.findOne({ reference: f.reference })).status, "refund_required");
    assert.equal((await webhook(f.reference)).code, 200);
  });

  let sequence = 0;
  const plan = await Plan.create({ name: "Callback plan", price: 100, duration: 30, propertyLimit: 10, imageLimit: 5 });
  const agent = () => User.create({ emailVerifiedAt: new Date(), firstName: "Test", lastName: "Agent", email: `agent${++sequence}@callback.test`, password: "test-password", role: "agent", agentApplication: { status: "approved", agentType: "individual" } });
  const checkout = (user, fields = {}) => Subscription.create({ user: user.id, plan: plan.id, planName: plan.name, amount: plan.price, planPrice: plan.price, durationDays: plan.duration, paymentReference: `HB-CALLBACK-${++sequence}`, ...fields });
  const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  await t.test("a signed webhook activates an agent subscription without the browser returning", async () => {
    const user = await agent(), record = await checkout(user);
    assert.equal((await webhook(record.paymentReference, { metadata: { userId: customer.id, planId: "forged" }, amount: 1 })).code, 200);
    const settled = await Subscription.findById(record.id);
    assert.equal(settled.paymentStatus, "paid");
    assert.equal(settled.status, "active");
    assert.equal(String((await User.findById(user.id)).subscription), record.id);
    assert.ok(!(await User.findById(customer.id)).subscription, "callback metadata never chooses the account");
    const expiry = +settled.expiresAt;
    assert.equal((await webhook(record.paymentReference)).code, 200);
    assert.equal(+(await Subscription.findById(record.id)).expiresAt, expiry, "replays do not extend the plan again");
  });

  await t.test("a subscription charged a different amount activates nothing and is held for a refund", async () => {
    const user = await agent(), record = await checkout(user);
    provider.set(record.paymentReference, { amount: 1 });
    assert.equal((await webhook(record.paymentReference)).code, 200);
    const held = await Subscription.findById(record.id);
    assert.equal(held.paymentStatus, "refund_required");
    assert.equal(held.status, "cancelled");
    assert.equal(String((await User.findById(user._id)).subscription || ""), "", "no plan was granted");
    provider.delete(record.paymentReference);
    assert.equal((await webhook(record.paymentReference)).code, 200);
    assert.equal((await Subscription.findById(record.id)).paymentStatus, "refund_required", "a redelivery cannot activate it");
  });

  await t.test("a subscription webhook ahead of provider confirmation is retried without changing the record", async () => {
    const user = await agent(), record = await checkout(user);
    provider.set(record.paymentReference, { status: "pending" });
    assert.equal((await webhook(record.paymentReference)).code, 503);
    assert.equal((await Subscription.findById(record.id)).paymentStatus, "pending");
    provider.delete(record.paymentReference);
    assert.equal((await webhook(record.paymentReference)).code, 200);
    assert.equal((await Subscription.findById(record.id)).paymentStatus, "paid");
  });

  await t.test("scheduled recovery settles subscription checkouts whose webhook and browser return were missed", async () => {
    const paid = await checkout(await agent());
    const abandoned = await checkout(await agent());
    const lateFailure = await checkout(await agent(), { paymentStatus: "failed" });
    const expired = await checkout(await agent(), { paymentStatus: "failed", createdAt: daysAgo(8) });
    const credit = await checkout(await agent(), { paymentMethod: "Plan credit", amount: 0 });
    provider.set(abandoned.paymentReference, { status: "abandoned" });
    const recovered = await recover();
    assert.equal(recovered.code, 200, JSON.stringify(recovered));
    assert.equal(recovered.data.subscriptions.checked, 3);
    assert.equal(recovered.data.subscriptions.paid, 2);
    assert.equal(recovered.data.subscriptions.failed, 1);
    assert.equal((await Subscription.findById(paid.id)).status, "active");
    assert.equal((await Subscription.findById(lateFailure.id)).paymentStatus, "paid", "a failed checkout completed later is still activated");
    assert.equal((await Subscription.findById(abandoned.id)).paymentStatus, "failed");
    assert.equal((await Subscription.findById(expired.id)).paymentStatus, "failed", "failed checkouts older than seven days are no longer rechecked");
    assert.equal((await Subscription.findById(credit.id)).paymentStatus, "pending", "plan-credit changes never go to Paystack");
    assert.equal((await recover()).data.subscriptions.checked, 0, "leases stop the same records being claimed again immediately");
    provider.delete(abandoned.paymentReference);
  });

  await t.test("opening onboarding rechecks older unsettled checkouts, not only the latest one", async () => {
    const user = await agent();
    const earlier = await checkout(user, { createdAt: daysAgo(3) });
    const latest = await checkout(user);
    provider.set(latest.paymentReference, { status: "abandoned" });
    await reconcileOpenPayments(user);
    assert.equal((await Subscription.findById(earlier.id)).paymentStatus, "paid");
    assert.equal((await Subscription.findById(latest.id)).paymentStatus, "failed");
    assert.equal(String((await User.findById(user.id)).subscription), earlier.id);
    provider.delete(latest.paymentReference);
  });

  // ---- Audit trail, refunds of mismatched charges, renewal reminders ----
  await t.test("confirmed payments keep Paystack's transaction ID and channel; one transaction can't be recorded on two payments", async () => {
    const a = await start(), b = await start();
    provider.set(a.reference, { id: 777000111, channel: "mobile_money" });
    assert.equal((await webhook(a.reference)).code, 200);
    const first = await Payment.findOne({ reference: a.reference });
    assert.equal(first.status, "paid");
    assert.equal(first.providerTransactionId, "777000111");
    assert.equal(first.channel, "mobile_money");
    // A second record claiming the same Paystack transaction is never linked to it, and an admin is alerted
    provider.set(b.reference, { id: 777000111, channel: "card" });
    assert.equal((await webhook(b.reference)).code, 200);
    assert.equal((await Payment.findOne({ reference: b.reference })).providerTransactionId, undefined);
    assert.equal(await Payment.countDocuments({ providerTransactionId: "777000111" }), 1);
    assert.ok(await Notification.exists({ audience: "admins", title: "Paystack transaction recorded twice" }));
    const user = await agent(), record = await checkout(user);
    provider.set(record.paymentReference, { id: 888000222, channel: "card" });
    assert.equal((await webhook(record.paymentReference)).code, 200);
    const sub = await Subscription.findById(record.id);
    assert.equal(sub.paymentStatus, "paid");
    assert.equal(sub.providerTransactionId, "888000222");
    for (const reference of [a.reference, b.reference, record.paymentReference]) provider.delete(reference);
  });

  await t.test("a mismatched charge is refunded for what Paystack actually charged", async () => {
    const f = await start();
    provider.set(f.reference, { amount: 15000 }); // GHS 150 charged for a GHS 100 booking
    assert.equal((await webhook(f.reference)).code, 200);
    const held = await Payment.findOne({ reference: f.reference });
    assert.equal(held.status, "refund_required");
    assert.equal(held.paidAmount, 150);
    const { refund } = await requestRefund(owner, { source: "payment", id: held.id, method: "manual", reason: "Returned by MoMo", externalReference: "MOMO-1" });
    assert.equal((await Refund.findById(refund._id)).amount, 150);
    provider.delete(f.reference);
  });

  await t.test("agents are reminded once, a week before their current plan expires", async () => {
    const day = 24 * 60 * 60 * 1000;
    const soon = await agent(), later = await agent(), replaced = await agent();
    const active = (user, days) => checkout(user, { status: "active", paymentStatus: "paid", startDate: new Date(), expiresAt: new Date(Date.now() + days * day) });
    const soonSub = await active(soon, 3), laterSub = await active(later, 20), oldSub = await active(replaced, 2);
    await User.updateOne({ _id: soon._id }, { subscription: soonSub._id });
    await User.updateOne({ _id: later._id }, { subscription: laterSub._id });
    await User.updateOne({ _id: replaced._id }, { subscription: (await active(replaced, 60))._id }); // oldSub is no longer the account's plan
    const first = await recover();
    assert.equal(first.data.reminders, 1, JSON.stringify(first));
    const notice = await Notification.findOne({ recipient: soon._id, title: "Your plan expires soon" });
    assert.ok(notice);
    assert.match(notice.message, /\(in 3 days\)\. Renew it from Subscription.*You won't be charged automatically\./);
    assert.equal(await Notification.countDocuments({ recipient: { $in: [later._id, replaced._id] }, title: "Your plan expires soon" }), 0);
    assert.ok((await Subscription.findById(oldSub.id)).renewalReminderAt, "checked once, not again");
    assert.equal((await recover()).data.reminders, 0, "never twice");
    assert.equal(await Notification.countDocuments({ recipient: soon._id, title: "Your plan expires soon" }), 1);
  });
});
