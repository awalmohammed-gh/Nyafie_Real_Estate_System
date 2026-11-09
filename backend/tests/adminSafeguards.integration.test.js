import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Rental from "../models/Rental.js";
import Setting from "../models/Setting.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("admin safeguards: admin accounts, listings with history, plans and unpaid checkouts", { skip: process.env.RUN_ADMIN_SAFEGUARDS_INTEGRATION !== "1", timeout: 90000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-admin-safeguards-signing-key-32-chars";
  process.env.PAYSTACK_MODE = "test";
  process.env.PAYSTACK_SECRET_KEY = "sk_test_isolated_admin_safeguards";
  await Setting.create({ key: "platform", payments: { subscriptionsEnabled: true, rentalsEnabled: true } });
  const [admin, otherAdmin] = await User.create([1, 2].map((n) => ({ emailVerifiedAt: new Date(), firstName: `Admin${n}`, lastName: "Test", email: `admin${n}@safe.test`, password: "test-password-long-enough", role: "admin" })));
  const customer = await User.create({ emailVerifiedAt: new Date(), firstName: "Customer", lastName: "Test", email: "customer@safe.test", phone: "0241234567", password: "test-password-long-enough" });
  const agent = await User.create({ emailVerifiedAt: new Date(), firstName: "Agent", lastName: "Test", email: "agent@safe.test", phone: "0241234567", password: "test-password-long-enough", role: "agent", agentApplication: { status: "approved" } });

  // Paystack: "abandoned" unless a reference is listed as paid
  const paidReferences = new Set();
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://api.paystack.co/")) return realFetch(url, options);
    const reference = decodeURIComponent(String(url).split("/").at(-1));
    const record = await Subscription.findOne({ paymentReference: reference });
    return { json: async () => ({ status: true, data: { reference, currency: "GHS", amount: Math.round((record?.amount || 0) * 100), status: paidReferences.has(reference) ? "success" : "abandoned" } }) };
  });

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const asAdmin = async (path, { method = "GET", body } = {}) => {
    const headers = { "Content-Type": "application/json", "X-Session-Domain": "admin", ...customerTabHeaders("admin"), Cookie: `admin_token=${jwt.sign({ id: admin.id, role: "admin", session: "admin", ...customerTabClaims("admin") }, process.env.JWT_KEY, { expiresIn: "1h" })}` };
    const response = await fetch(`${base}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { code: response.status, ...(await response.json()) };
  };

  await t.test("admin accounts can't be edited through the user editor (not even your own)", async () => {
    for (const target of [otherAdmin, admin]) {
      const result = await asAdmin(`/admin/users/${target.id}`, { method: "PUT", body: { email: "takeover@safe.test" } });
      assert.equal(result.code, 403, target.email);
    }
    assert.equal((await User.findById(otherAdmin._id)).email, "admin2@safe.test");
    assert.equal((await asAdmin(`/admin/users/${customer.id}`, { method: "PUT", body: { firstName: "Renamed" } })).code, 200, "customers are still editable");
  });

  await t.test("listings with bookings or payments on record can't be deleted; ones without can", async () => {
    const listing = (title) => Property.create({ title, description: "A test listing used to check deletion rules here.", propertyType: "Apartment", listingType: "Rent", price: 1000, pricePeriod: "month", owner: admin._id, ownerType: "admin", status: "published", availability: "Available" });
    const booked = await listing("Booked flat");
    await Rental.create({ customer: customer._id, property: booked._id, owner: admin._id, ownerType: "admin", startDate: new Date("2031-01-01"), endDate: new Date("2031-02-01"), pricePeriod: "month", unitPrice: 1000, units: 1, amount: 1000, status: "confirmed", paymentStatus: "paid", contactName: "C", contactEmail: "c@safe.test", contactPhone: "0241234567" });
    const blocked = await asAdmin(`/admin/properties/${booked.id}`, { method: "DELETE" });
    assert.equal(blocked.code, 409);
    assert.match(blocked.message, /Mark it as rented or sold, or unpublish it/);
    assert.ok(await Property.exists({ _id: booked._id }));
    const requestOnly = await listing("Asked-about flat");
    await Rental.create({ customer: customer._id, property: requestOnly._id, owner: admin._id, ownerType: "admin", startDate: new Date("2031-01-01"), endDate: new Date("2031-02-01"), pricePeriod: "month", unitPrice: 1000, units: 1, amount: 1000, status: "pending", paymentStatus: "pending", contactName: "C", contactEmail: "c@safe.test", contactPhone: "0241234567" });
    assert.equal((await asAdmin(`/admin/properties/${requestOnly.id}`, { method: "DELETE" })).code, 200, "an unanswered request doesn't block deletion");
  });

  const plan = await Plan.create({ name: "Safeguard Plan", price: 100, duration: 30, propertyLimit: 5, imageLimit: 5 });
  const checkout = (reference) => Subscription.create({ user: agent._id, plan: plan._id, planName: plan.name, amount: 100, planPrice: 100, durationDays: 30, paymentReference: reference, paymentMethod: "Paystack", environment: "test", status: "pending", paymentStatus: "pending" });

  await t.test("plans with any subscription (even one still being paid) can't be deleted", async () => {
    await checkout("HB-SAFE-PENDING-1");
    const refused = await asAdmin(`/plans/${plan.id}`, { method: "DELETE" });
    assert.equal(refused.code, 409);
    assert.ok(await Plan.exists({ _id: plan._id }));
    const unused = await Plan.create({ name: "Unused Plan", price: 50, duration: 30, propertyLimit: 5, imageLimit: 5 });
    assert.equal((await asAdmin(`/plans/${unused.id}`, { method: "DELETE" })).code, 200);
  });

  await t.test("activating an unpaid checkout never records it as paid", async () => {
    await User.updateOne({ _id: agent._id }, { subscription: (await Subscription.findOne({ paymentReference: "HB-SAFE-PENDING-1" }))._id });
    const result = await asAdmin(`/admin/agents/${agent.id}/subscription`, { method: "PATCH", body: { action: "activate" } });
    assert.equal(result.code, 200, JSON.stringify(result));
    assert.match(result.message, /complimentary/);
    assert.equal((await Subscription.findOne({ paymentReference: "HB-SAFE-PENDING-1" })).paymentStatus, "failed", "the checkout is not marked paid");
    const current = await Subscription.findById((await User.findById(agent._id)).subscription);
    assert.equal(current.paymentStatus, "waived");
    assert.equal(current.paymentMethod, "Admin");
    assert.equal(current.status, "active");
  });

  await t.test("activating a checkout Paystack confirms records it as paid", async () => {
    const paidCheckout = await checkout("HB-SAFE-PAID-2");
    paidReferences.add("HB-SAFE-PAID-2");
    await User.updateOne({ _id: agent._id }, { subscription: paidCheckout._id });
    const result = await asAdmin(`/admin/agents/${agent.id}/subscription`, { method: "PATCH", body: { action: "activate" } });
    assert.match(result.message, /Payment confirmed with Paystack/);
    assert.equal((await Subscription.findById(paidCheckout._id)).paymentStatus, "paid");
  });

  await t.test("extending a subscription takes a sensible number of days", async () => {
    for (const days of [0, -5, 1.5, 999999, "lots"]) assert.equal((await asAdmin(`/admin/agents/${agent.id}/subscription`, { method: "PATCH", body: { action: "extend", days } })).code, 400, String(days));
    assert.equal((await asAdmin(`/admin/agents/${agent.id}/subscription`, { method: "PATCH", body: { action: "extend", days: 30 } })).code, 200);
  });
});
