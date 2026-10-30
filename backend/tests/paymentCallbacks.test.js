import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Payment from "../models/Payment.js";
import Rental from "../models/Rental.js";
import { createApp } from "../app.js";
import { validPaystackSignature } from "../utils/paystack.js";

test("payment callbacks authenticate raw bytes and service credentials before database initialization", async (t) => {
  const keys = ["Test_Secret_Key", "CRON_SECRET"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.Test_Secret_Key = "sk_test_callback_security";
  process.env.CRON_SECRET = "test-cron-secret-with-at-least-32-characters";
  t.after(() => { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
  const sign = (body) => crypto.createHmac("sha512", process.env.Test_Secret_Key).update(body).digest("hex");
  let initializations = 0, lookups = 0, claims = 0;
  const server = createApp({ initialize: async () => { initializations += 1; } }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api/payments`;
  t.mock.method(Payment, "findOne", async () => { lookups += 1; return null; });
  t.mock.method(Payment, "findOneAndUpdate", () => ({ sort: async () => { claims += 1; return null; } }));
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
    assert.equal(lookups, 1);
  });

  await t.test("unsupported events are acknowledged and malformed signed references are rejected", async () => {
    const unsupported = '{"event":"transfer.success"}';
    assert.equal((await send(unsupported, sign(unsupported))).status, 200);
    for (const body of ['{', '{"event":"charge.success","data":{"reference":{"$ne":null}}}', '{"event":"charge.success","data":{"reference":""}}']) {
      assert.equal((await send(body, sign(body))).status, 400);
    }
    assert.equal(lookups, 1, "invalid reference objects never become database filters");
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
    assert.equal((await res.json()).data.checked, 0);
    assert.equal(claims, 1);
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

  await t.test("unconfigured payment callbacks fail closed", async () => {
    const before = initializations;
    process.env.Test_Secret_Key = "";
    assert.equal((await send("{}", "0".repeat(128))).status, 503);
    assert.equal(initializations, before);
  });
});
