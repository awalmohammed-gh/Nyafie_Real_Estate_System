import { test } from "node:test";
import assert from "node:assert/strict";
import { liveBlockers, paymentEnvironment, paymentMode, paymentStatus, paystackPaymentStatus, providerScope, inCurrentEnvironment, createPaystackRefund } from "../utils/paystack.js";

const KEYS = ["PAYSTACK_MODE", "PAYSTACK_SECRET_KEY", "PAYSTACK_PUBLIC_KEY", "Test_Secret_Key", "Test_Public_Key", "CRON_SECRET"];
const CRON = "c".repeat(32);

const configure = (t, values) => {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, values);
  t.after(() => { for (const key of KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
};

test("test mode is the default and only accepts test keys", async (t) => {
  await t.test("the original Test_Secret_Key variable still enables test mode", (st) => {
    configure(st, { Test_Secret_Key: "sk_test_legacy" });
    assert.equal(paymentEnvironment(), "test");
    assert.equal(paymentMode(), "paystack");
  });
  await t.test("PAYSTACK_SECRET_KEY takes precedence", (st) => {
    configure(st, { PAYSTACK_SECRET_KEY: "sk_test_new", Test_Secret_Key: "sk_live_should_not_be_used" });
    assert.equal(paymentEnvironment(), "test");
  });
  await t.test("a live key without PAYSTACK_MODE=live never charges real money", (st) => {
    configure(st, { PAYSTACK_SECRET_KEY: "sk_live_real", CRON_SECRET: CRON });
    assert.equal(paymentMode(), "disabled");
  });
  await t.test("an unknown mode disables payments", (st) => {
    configure(st, { PAYSTACK_MODE: "production", PAYSTACK_SECRET_KEY: "sk_live_real", CRON_SECRET: CRON });
    assert.equal(paymentMode(), "disabled");
    assert.equal(paymentStatus().mode, "invalid");
  });
});

test("live mode needs a deliberate switch, a live key and scheduled recovery", async (t) => {
  await t.test("all requirements met", (st) => {
    configure(st, { PAYSTACK_MODE: "live", PAYSTACK_SECRET_KEY: "sk_live_real", PAYSTACK_PUBLIC_KEY: "pk_live_real", CRON_SECRET: CRON });
    assert.equal(paymentEnvironment(), "live");
    assert.deepEqual(liveBlockers(), []);
    const status = paymentStatus();
    assert.equal(status.environment, "live");
    assert.equal(status.publicKeyConfigured, true);
    assert.ok(!JSON.stringify(status).includes("sk_live_real"), "the summary never exposes key values");
  });
  await t.test("a test key in live mode is refused", (st) => {
    configure(st, { PAYSTACK_MODE: "live", PAYSTACK_SECRET_KEY: "sk_test_wrong", CRON_SECRET: CRON });
    assert.equal(paymentMode(), "disabled");
    assert.equal(paymentStatus().liveBlockers.length, 1);
  });
  await t.test("the legacy test variable cannot carry a live key", (st) => {
    configure(st, { PAYSTACK_MODE: "live", Test_Secret_Key: "sk_live_real", CRON_SECRET: CRON });
    assert.equal(paymentMode(), "disabled");
  });
  await t.test("without CRON_SECRET missed payments could not be recovered, so live stays off", (st) => {
    configure(st, { PAYSTACK_MODE: "live", PAYSTACK_SECRET_KEY: "sk_live_real", CRON_SECRET: "short" });
    assert.equal(paymentMode(), "disabled");
    assert.match(liveBlockers()[0], /CRON_SECRET/);
  });
});

test("records are only checked, counted and refunded in the Paystack mode they were made in", async (t) => {
  await t.test("test mode includes records saved before modes were stored", (st) => {
    configure(st, { PAYSTACK_SECRET_KEY: "sk_test_scope" });
    assert.deepEqual(providerScope(), { $or: [{ method: { $ne: "Paystack" } }, { environment: "test" }, { environment: null }] });
    assert.equal(inCurrentEnvironment({ environment: null }), true);
  });
  await t.test("live mode excludes every test-mode record", (st) => {
    configure(st, { PAYSTACK_MODE: "live", PAYSTACK_SECRET_KEY: "sk_live_scope", CRON_SECRET: CRON });
    assert.deepEqual(providerScope("paymentMethod"), { $or: [{ paymentMethod: { $ne: "Paystack" } }, { environment: "live" }] });
    assert.equal(inCurrentEnvironment({ environment: null }), false);
    assert.equal(inCurrentEnvironment({ environment: "live" }), true);
  });
  await t.test("a successful transaction from the other mode is not a payment", async (st) => {
    configure(st, { PAYSTACK_MODE: "live", PAYSTACK_SECRET_KEY: "sk_live_scope", CRON_SECRET: CRON });
    let domain = "test";
    st.mock.method(globalThis, "fetch", async () => Response.json({ status: true, data: { status: "success", reference: "HB-1", amount: 10000, currency: "GHS", domain } }));
    assert.equal(await paystackPaymentStatus("HB-1", 100), "failed");
    domain = "live";
    assert.equal(await paystackPaymentStatus("HB-1", 100), "paid");
  });
});

test("refund requests send the whole amount in pesewas and distrust mismatched answers", async (t) => {
  configure(t, { PAYSTACK_SECRET_KEY: "sk_test_refund" });
  let sent, reply;
  t.mock.method(globalThis, "fetch", async (_url, options) => { sent = JSON.parse(options.body); return Response.json(reply); });
  reply = { status: true, data: { id: 3018284, status: "pending", amount: 12550, currency: "GHS", transaction: { reference: "HBR-1" } } };
  assert.deepEqual(await createPaystackRefund("HBR-1", 125.5, "Duplicate charge"), { accepted: true, id: "3018284", status: "pending" });
  assert.deepEqual(sent, { transaction: "HBR-1", amount: 12550, currency: "GHS", merchant_note: "Duplicate charge" });
  reply = { status: true, data: { id: 9, status: "pending", amount: 100, currency: "GHS", transaction: { reference: "HBR-1" } } };
  const mismatch = await createPaystackRefund("HBR-1", 125.5);
  assert.equal(mismatch.accepted, true);
  assert.equal(mismatch.status, null, "an answer for a different amount is never trusted as a status");
  reply = { status: false, message: "Transaction has been fully reversed" };
  assert.deepEqual(await createPaystackRefund("HBR-1", 125.5), { accepted: false, message: "Transaction has been fully reversed" });
});
