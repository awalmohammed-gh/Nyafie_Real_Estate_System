import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Payment from "../models/Payment.js";
import Rental from "../models/Rental.js";
import Subscription from "../models/Subscription.js";
import Refund from "../models/Refund.js";
import Dispute from "../models/Dispute.js";
import { createApp } from "../app.js";
import { validPaystackSignature } from "../utils/paystack.js";

test("payment callbacks authenticate raw bytes and service credentials before database initialization", async (t) => {
  const keys = ["PAYSTACK_SECRET_KEY", "CRON_SECRET"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.PAYSTACK_SECRET_KEY = "sk_test_callback_security";
  process.env.CRON_SECRET = "test-cron-secret-with-at-least-32-characters";
  t.after(() => { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
  const sign = (body) => crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(body).digest("hex");
  let initializations = 0, lookups = 0, claims = 0;
  const server = createApp({ initialize: async () => { initializations += 1; } }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api/payments`;
  t.mock.method(Payment, "findOne", async () => { lookups += 1; return null; });
  t.mock.method(Payment, "findOneAndUpdate", () => ({ sort: async () => { claims += 1; return null; } }));
  t.mock.method(Subscription, "findOne", async () => { lookups += 1; return null; });
  t.mock.method(Subscription, "findOneAndUpdate", () => ({ sort: async () => { claims += 1; return null; } }));
  t.mock.method(Refund, "findOneAndUpdate", () => ({ sort: async () => { claims += 1; return null; } }));
  t.mock.method(Dispute, "findOneAndUpdate", () => ({ sort: async () => { claims += 1; return null; } }));
  t.mock.method(Refund, "findOne", () => ({ sort: async () => { lookups += 1; return null; } }));
  const send = (body, signature, headers = {}) => fetch(`${base}/paystack/webhook`, { method: "POST", headers: { "Content-Type": "application/json", ...(signature ? { "x-paystack-signature": signature } : {}), ...headers }, body });

  await t.test("invalid or tampered signatures cannot reach the database", async () => {
    const body = '{"event":"charge.success","data":{"reference":"HB-test"}}';
    for (const signature of [undefined, "forged", "0".repeat(128), sign(`${body} `)]) assert.equal((await send(body, signature)).status, 401);
    assert.equal(initializations, 0);
    assert.equal(lookups, 0);
    assert.equal(validPaystackSignature(Buffer.from(body), sign(body)), true);
    assert.equal(validPaystackSignature(body, sign(body)), false);
  });

  await t.test("correct signatures accept the exact original whitespace without cookies or a trusted browser origin", async () => {
    const body = '{ "data": { "reference": "unknown-payment" },\n "event": "charge.success" }';
    const res = await send(body, sign(body), { Origin: "https://provider.example", "X-Session-Domain": "admin" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.ignored, true);
    assert.equal(initializations, 1);
    assert.equal(lookups, 2, "an unknown reference is looked up in the rental and subscription ledgers");
  });

  await t.test("unsupported events are acknowledged and malformed signed references are rejected", async () => {
    const unsupported = '{"event":"transfer.success"}';
    assert.equal((await send(unsupported, sign(unsupported))).status, 200);
    for (const body of ['{', '{"event":"charge.success","data":{"reference":{"$ne":null}}}', '{"event":"charge.success","data":{"reference":""}}']) {
      assert.equal((await send(body, sign(body))).status, 400);
    }
    assert.equal(lookups, 2, "invalid reference objects never become database filters");
  });

  await t.test("recovery refuses missing or incorrect service authorization before initialization", async () => {
    const before = initializations;
    for (const headers of [{}, { Authorization: "Bearer incorrect" }, { Cookie: "admin_token=forged" }]) assert.equal((await fetch(`${base}/reconcile`, { headers })).status, 401);
    assert.equal(initializations, before);
    assert.equal(claims, 0);
    const secret = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    assert.equal((await fetch(`${base}/reconcile`)).status, 503);
    process.env.CRON_SECRET = secret;
  });

  await t.test("authorized recovery is bounded and never cached", async () => {
    const res = await fetch(`${base}/reconcile`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.equal(body.data.checked, 0);
    assert.equal(body.data.subscriptions.checked, 0);
    assert.equal(body.data.refunds.checked, 0);
    assert.equal(body.data.disputes.checked, 0);
    assert.equal(claims, 4, "rentals, subscriptions, refunds and disputes are each checked for due work");
  });

  await t.test("recovery processes at most 20 records and reports partial failures", async (st) => {
    let attempts = 0;
    st.mock.method(Payment, "findOneAndUpdate", () => ({ sort: async () => { attempts += 1; return { reference: "HBR-bounded-test", rental: "missing" }; } }));
    st.mock.method(Rental, "findById", async () => null);
    st.mock.method(console, "error", () => {});
    const res = await fetch(`${base}/reconcile`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.data.checked, 20);
    assert.equal(body.data.errors, 20);
    assert.equal(attempts, 20);
  });

  await t.test("rentals and subscriptions share the recovery budget so neither backlog starves the other", async (st) => {
    const realFetch = globalThis.fetch;
    st.mock.method(Payment, "findOneAndUpdate", () => ({ sort: async () => ({ reference: "HBR-shared-test", rental: "missing" }) }));
    st.mock.method(Rental, "findById", async () => null);
    st.mock.method(Subscription, "findOneAndUpdate", () => ({ sort: async () => ({ paymentReference: "HB-shared-test", paymentStatus: "pending", amount: 100 }) }));
    st.mock.method(globalThis, "fetch", async (url, options) => {
      if (String(url).startsWith("https://api.paystack.co/")) throw new Error("Simulated provider outage");
      return realFetch(url, options);
    });
    st.mock.method(console, "error", () => {});
    const res = await fetch(`${base}/reconcile`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    assert.equal(res.status, 503);
    const { data } = await res.json();
    assert.equal(data.checked, 20);
    assert.equal(data.rentals.checked, 10);
    assert.equal(data.subscriptions.checked, 10);
    assert.equal(data.subscriptions.errors, 10);
  });

  await t.test("signed refund events are matched to a stored refund and never create records", async () => {
    const before = lookups;
    for (const event of ["refund.processed", "refund.failed"]) {
      const body = JSON.stringify({ event, data: { status: event.slice(7), transaction_reference: "unknown-refund", amount: "10000" } });
      const res = await send(body, sign(body));
      assert.equal(res.status, 200);
      assert.equal((await res.json()).data.ignored, true);
    }
    const malformed = JSON.stringify({ event: "refund.processed", data: { transaction_reference: { $ne: null } } });
    assert.equal((await (await send(malformed, sign(malformed))).json()).data.ignored, true);
    assert.equal(lookups, before + 2, "object references never become database filters");
  });

  await t.test("unconfigured payment callbacks fail closed", async () => {
    const before = initializations;
    process.env.PAYSTACK_SECRET_KEY = "";
    assert.equal((await send("{}", "0".repeat(128))).status, 503);
    assert.equal(initializations, before);
  });
});
