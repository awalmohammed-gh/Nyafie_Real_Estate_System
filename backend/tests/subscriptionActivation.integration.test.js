import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Setting from "../models/Setting.js";
import Notification from "../models/Notification.js";
import { createApp } from "../app.js";
import { activateSubscription } from "../controllers/subscriptionController.js";
import { isolatedMongo } from "./support/isolatedMongo.js";
import { TEST_SESSION } from "./support/sessions.js";

const DAY = 86400000;

test("subscription activation commits payment, history and account together exactly once", {
  skip: process.env.RUN_SUBSCRIPTION_INTEGRATION !== "1", timeout: 90000,
}, async (t) => {
  const previous = { JWT_KEY: process.env.JWT_KEY, PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY, NODE_ENV: process.env.NODE_ENV };
  Object.assign(process.env, { JWT_KEY: "subscription-activation-integration-key", PAYSTACK_SECRET_KEY: "sk_test_subscription_activation", NODE_ENV: "development" });
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  await isolatedMongo(t);
  await Setting.create({ key: "platform", agent: { requireSubscription: true } });
  const realFetch = globalThis.fetch;
  let verification;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://api.paystack.co/")) return realFetch(url, options);
    const reference = decodeURIComponent(String(url).split("/").pop());
    if (verification) return verification(reference);
    const record = await Subscription.findOne({ paymentReference: reference });
    return Response.json({ status: true, data: { reference, currency: "GHS", amount: Math.round(record.amount * 100), status: "success" } });
  });
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let sequence = 0;
  const plan = (fields = {}) => Plan.create({ name: `Plan ${++sequence}`, price: 100, duration: 30, propertyLimit: 10, imageLimit: 5, ...fields });
  const agent = (fields = {}) => User.create({ firstName: "Test", lastName: "Agent", email: `agent${++sequence}@subscription.test`, password: "TestPassword123", emailVerifiedAt: new Date(), role: "agent", agentApplication: { status: "approved", agentType: "individual" }, ...fields });
  const purchase = (user, target, fields = {}) => Subscription.create({ user: user.id, plan: target.id, planName: target.name, accountType: target.accountType, amount: target.price, planPrice: target.price, durationDays: target.duration, paymentReference: `SUB-${++sequence}`, ...fields });
  const verify = (user, record) => realFetch(base + "/subscriptions/verify", { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Domain": "agent", Cookie: "agent_token=" + jwt.sign({ sid: TEST_SESSION, id: user.id, role: "agent", session: "agent" }, process.env.JWT_KEY, { expiresIn: "1h" }) }, body: JSON.stringify({ reference: record.paymentReference }) });
  const currentPlan = async (user, target, fields = {}) => {
    const current = await purchase(user, target, { status: "active", paymentStatus: "paid", startDate: new Date(Date.now() - 5 * DAY), expiresAt: new Date(Date.now() + 25 * DAY), paidAt: new Date(), ...fields });
    await User.updateOne({ _id: user.id }, { subscription: current.id });
    return current;
  };

  await t.test("plan edits after checkout cannot change the purchased period or price", async () => {
    const user = await agent(), target = await plan();
    const record = await purchase(user, target);
    await Plan.updateOne({ _id: target.id }, { duration: 90, price: 999 });
    const response = await verify(user, record);
    assert.equal(response.status, 200);
    const settled = await Subscription.findById(record.id);
    assert.equal(settled.durationDays, 30);
    assert.equal(settled.planPrice, 100);
    assert.equal(settled.expiresAt - settled.startDate, 30 * DAY);
    assert.ok(settled.activationProcessedAt);
    assert.equal(String((await User.findById(user.id)).subscription), record.id);
  });

  await t.test("a failed account write rolls back both subscriptions and retry succeeds", async (st) => {
    const user = await agent(), oldPlan = await plan(), newPlan = await plan({ price: 200 });
    const previous = await currentPlan(user, oldPlan);
    const record = await purchase(user, newPlan);
    const originalSave = User.prototype.save;
    let failAccountWrite = true;
    st.mock.method(User.prototype, "save", async function (options) {
      if (this.id === user.id && options?.session && failAccountWrite) throw new Error("Injected account write failure");
      return originalSave.call(this, options);
    });
    await assert.rejects(activateSubscription(record), /Injected/);
    assert.equal((await Subscription.findById(record.id)).paymentStatus, "pending");
    assert.equal((await Subscription.findById(record.id)).activationProcessedAt, undefined);
    assert.equal((await Subscription.findById(previous.id)).status, "active");
    assert.equal(String((await User.findById(user.id)).subscription), previous.id);
    failAccountWrite = false;
    assert.equal((await verify(user, record)).status, 200);
    assert.equal((await Subscription.findById(previous.id)).status, "cancelled");
    assert.equal((await Subscription.findById(record.id)).paymentStatus, "paid");
    assert.equal(String((await User.findById(user.id)).subscription), record.id);
  });

  await t.test("competing confirmations grant one renewal and later refreshes leave dates unchanged", async () => {
    const user = await agent(), target = await plan();
    const previous = await currentPlan(user, target);
    const record = await purchase(user, target, { kind: "renewal", durationDays: 14 });
    const responses = await Promise.all(Array.from({ length: 5 }, () => verify(user, record)));
    assert.ok(responses.every((response) => response.status === 200));
    let settled = await Subscription.findById(record.id);
    const expiry = +settled.expiresAt;
    assert.equal(expiry, +previous.expiresAt + 14 * DAY);
    assert.equal((await Subscription.findById(previous.id)).status, "expired");
    await activateSubscription(record); // deliberately pass the stale pre-verification document
    assert.equal((await verify(user, record)).status, 200);
    settled = await Subscription.findById(record.id);
    assert.equal(+settled.expiresAt, expiry);
  });

  await t.test("separate simultaneous renewals each add their purchased period", async () => {
    const user = await agent(), target = await plan();
    const previous = await currentPlan(user, target);
    const first = await purchase(user, target, { kind: "renewal", durationDays: 10 });
    const second = await purchase(user, target, { kind: "renewal", durationDays: 20 });
    await Promise.all([activateSubscription(first), activateSubscription(second)]);
    const holder = await User.findById(user.id);
    const active = await Subscription.findById(holder.subscription);
    assert.equal(+active.expiresAt, +previous.expiresAt + 30 * DAY);
    assert.equal(await Subscription.countDocuments({ user: user.id, status: "active" }), 1);
  });

  await t.test("a late failed provider response cannot replace a committed paid state", async () => {
    const user = await agent(), target = await plan(), record = await purchase(user, target);
    let began, release;
    const started = new Promise((done) => { began = done; });
    const wait = new Promise((done) => { release = done; });
    let calls = 0;
    verification = async (reference) => {
      const first = ++calls === 1;
      if (first) { began(); await wait; }
      return Response.json({ status: true, data: { reference, currency: "GHS", amount: 10000, status: first ? "failed" : "success" } });
    };
    try {
      const delayed = verify(user, record);
      await started;
      assert.equal((await verify(user, record)).status, 200);
      release();
      assert.equal((await delayed).status, 200);
      assert.equal((await Subscription.findById(record.id)).paymentStatus, "paid");
      assert.equal(String((await User.findById(user.id)).subscription), record.id);
    } finally { release(); verification = undefined; }
  });

  await t.test("removed providers and legacy settled or cancelled records cannot be reactivated by retries", async () => {
    const target = await plan();
    const removed = await agent({ isActive: false, agentApplication: { status: "removed" } });
    const late = await purchase(removed, target);
    await activateSubscription(late);
    assert.equal((await Subscription.findById(late.id)).paymentStatus, "paid");
    assert.equal((await Subscription.findById(late.id)).status, "pending");
    assert.equal((await User.findById(removed.id)).subscription, null);
    await User.updateOne({ _id: removed.id }, { isActive: true, "agentApplication.status": "approved" });
    await activateSubscription(late);
    assert.equal((await User.findById(removed.id)).subscription, null);
    const holder = await agent();
    const legacy = await currentPlan(holder, target, { status: "cancelled" });
    const before = +legacy.expiresAt;
    await activateSubscription(legacy);
    assert.equal((await Subscription.findById(legacy.id)).status, "cancelled");
    assert.equal(+(await Subscription.findById(legacy.id)).expiresAt, before);
  });

  await t.test("a checkout paid after a newer plan became current is held for a refund, not applied", async () => {
    const user = await agent(), oldTarget = await plan(), newTarget = await plan({ price: 200 });
    const stale = await purchase(user, oldTarget, { createdAt: new Date(Date.now() - DAY) });
    const current = await currentPlan(user, newTarget);
    const notifications = await Notification.countDocuments();
    const response = await verify(user, stale);
    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /refund/);
    const flagged = await Subscription.findById(stale.id);
    assert.equal(flagged.paymentStatus, "refund_required");
    assert.equal(flagged.status, "cancelled");
    assert.match(flagged.note, new RegExp(newTarget.name));
    assert.equal((await Subscription.findById(current.id)).status, "active");
    assert.equal(String((await User.findById(user.id)).subscription), current.id);
    assert.equal(await Notification.countDocuments(), notifications + 2, "admins and the agent are told once");
    assert.equal((await verify(user, stale)).status, 409);
    await activateSubscription(stale);
    assert.equal(await Notification.countDocuments(), notifications + 2, "retries do not repeat the alert");
    assert.equal((await Subscription.findById(stale.id)).paymentStatus, "refund_required");
  });

  await t.test("a stale upgrade credit cannot be reused as a renewal, but full-price renewals still stack", async () => {
    const user = await agent(), target = await plan();
    const upgrade = await purchase(user, target, { kind: "upgrade", credit: 40, amount: 60, createdAt: new Date(Date.now() - DAY) });
    const renewal = await purchase(user, target, { kind: "renewal", createdAt: new Date(Date.now() - DAY) });
    const current = await currentPlan(user, target);
    await activateSubscription(upgrade);
    await activateSubscription(renewal);
    assert.equal((await Subscription.findById(upgrade.id)).paymentStatus, "refund_required");
    const renewed = await Subscription.findById(renewal.id);
    assert.equal(renewed.paymentStatus, "paid");
    assert.equal(+renewed.expiresAt, +current.expiresAt + 30 * DAY);
  });

  await t.test("an upgrade credit only counts money that was kept", async (st) => {
    const basic = () => plan({ sortOrder: 1 }), higher = () => plan({ price: 300, sortOrder: 2 });
    const asAgent = async (user, path, body) => {
      const response = await realFetch(base + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "X-Session-Domain": "agent", Cookie: "agent_token=" + jwt.sign({ sid: TEST_SESSION, id: user.id, role: "agent", session: "agent" }, process.env.JWT_KEY, { expiresIn: "1h" }) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { code: response.status, ...(await response.json()) };
    };
    const ready = () => agent({ emailVerifiedAt: new Date(), agentApplication: { status: "approved", agentType: "individual", profileCompletedAt: new Date() } });
    const quoteFor = async (fields) => {
      const user = await ready(), target = await higher();
      await currentPlan(user, await basic(), { expiresAt: new Date(Date.now() + 15 * DAY), ...fields });
      return { user, target, quote: await asAgent(user, "/subscriptions/quote", { planId: target.id }) };
    };
    await st.test("no dispute: the unused half is credited", async () => {
      const { quote } = await quoteFor({});
      assert.equal(quote.code, 200, JSON.stringify(quote));
      assert.equal(quote.data.credit, 50);
    });
    await st.test("a dispute that was won changes nothing", async () => assert.equal((await quoteFor({ disputeStatus: "won" })).quote.data.credit, 50));
    await st.test("a lost dispute leaves no credit", async () => {
      const { quote } = await quoteFor({ disputeStatus: "lost", disputeLost: 100 });
      assert.equal(quote.data.credit, 0);
      assert.equal(quote.data.amount, 300);
    });
    await st.test("a partly lost one comes off the credit", async () => assert.equal((await quoteFor({ disputeStatus: "lost", disputeLost: 40 })).quote.data.credit, 10));
    await st.test("money lost on the payment an upgrade or renewal came from counts too, but not a separate earlier purchase", async () => {
      const user = await ready(), first = await purchase(user, await basic(), { disputeStatus: "lost", disputeLost: 100, status: "cancelled", paymentStatus: "paid" });
      const target = await higher();
      await currentPlan(user, await basic(), { kind: "upgrade", previousSubscription: first.id, expiresAt: new Date(Date.now() + 15 * DAY) });
      assert.equal((await asAgent(user, "/subscriptions/quote", { planId: target.id })).data.credit, 0);
      await Subscription.updateOne({ previousSubscription: first.id }, { kind: "new" });
      assert.equal((await asAgent(user, "/subscriptions/quote", { planId: target.id })).data.credit, 50);
    });
    await st.test("an undecided dispute pauses upgrades but not renewals", async () => {
      for (const disputeStatus of ["open", "check"]) {
        const { user, quote } = await quoteFor({ disputeStatus });
        assert.equal(quote.code, 409);
        assert.match(quote.message, /disputed/);
        const listed = await asAgent(user, "/subscriptions/upgrades");
        assert.equal(listed.code, 200);
        assert.match(listed.data.blocked, /disputed/);
        assert.equal(listed.data.highest, false);
        assert.deepEqual(listed.data.upgrades, []);
        const current = await Subscription.findOne({ user: user.id, status: "active" });
        assert.equal((await asAgent(user, "/subscriptions/quote", { planId: String(current.plan) })).data.kind, "renewal");
      }
    });
    await st.test("a checkout saved before the dispute can't be paid later at the credited price", async () => {
      for (const dispute of [{ disputeStatus: "open" }, { disputeStatus: "lost", disputeLost: 100 }]) {
        const user = await ready(), target = await higher();
        const current = await currentPlan(user, await basic(), { expiresAt: new Date(Date.now() + 15 * DAY), activationProcessedAt: new Date(Date.now() - 5 * DAY) });
        const saved = await purchase(user, target, { kind: "upgrade", credit: 50, amount: 250 });
        await Subscription.updateOne({ _id: current.id }, dispute);
        const response = await verify(user, saved);
        assert.equal(response.status, 409);
        assert.match((await response.json()).message, /upgrade credit was disputed/);
        assert.equal((await Subscription.findById(saved.id)).paymentStatus, "refund_required");
        assert.equal((await Subscription.findById(current.id)).status, "active");
      }
    });
    await st.test("an ordinary saved upgrade still activates", async () => {
      const user = await ready(), target = await higher();
      await currentPlan(user, await basic(), { expiresAt: new Date(Date.now() + 15 * DAY), activationProcessedAt: new Date(Date.now() - 5 * DAY) });
      const saved = await purchase(user, target, { kind: "upgrade", credit: 50, amount: 250 });
      assert.equal((await verify(user, saved)).status, 200);
      assert.equal(String((await User.findById(user.id)).subscription), saved.id);
    });
  });

  await t.test("legacy attempts fall back to the plan duration and waived activation stays waived", async () => {
    const user = await agent(), target = await plan({ duration: 7 });
    const record = await purchase(user, target, { durationDays: undefined });
    await activateSubscription(record, { paymentStatus: "waived" });
    const settled = await Subscription.findById(record.id);
    assert.equal(settled.durationDays, 7);
    assert.equal(settled.paymentStatus, "waived");
    assert.equal(settled.expiresAt - settled.startDate, 7 * DAY);
  });
});
