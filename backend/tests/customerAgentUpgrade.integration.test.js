import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Setting from "../models/Setting.js";
import { isolatedMongo } from "./support/isolatedMongo.js";
import { customerTabHeaders } from "./support/customerTab.js";

test("customers become agents on the same account, pay first, and retain customer access", {
  skip: process.env.RUN_CUSTOMER_AGENT_INTEGRATION !== "1",
}, async (t) => {
  const previous = { JWT_KEY: process.env.JWT_KEY, Test_Secret_Key: process.env.Test_Secret_Key };
  process.env.JWT_KEY = "customer-agent-upgrade-regression-key";
  process.env.Test_Secret_Key = "sk_test_customer_agent_upgrade";
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  await isolatedMongo(t);
  await Setting.create({ key: "platform", agent: { requireSubscription: true }, payments: { subscriptionsEnabled: true } });
  const savedProperty = new mongoose.Types.ObjectId();
  const account = await User.create({ firstName: "Existing", lastName: "Customer", email: "existing@example.test", password: "OriginalPassword123", savedProperties: [savedProperty], preferences: { offerUpdates: false } });
  const plan = await Plan.create({ name: "Individual Starter", accountType: "individual", price: 150, duration: 30, propertyLimit: 5, imageLimit: 3 });
  const agencyPlan = await Plan.create({ name: "Agency Starter", accountType: "agency", price: 500, duration: 30, propertyLimit: 20, imageLimit: 5 });
  const retiredPlan = await Plan.create({ name: "Retired", accountType: "individual", price: 100, duration: 30, propertyLimit: 5, imageLimit: 3, isActive: false });
  const passwordBefore = (await User.findById(account.id).select("+password")).password;
  const realFetch = globalThis.fetch;
  let paymentStatus = "pending", amount = 15000;
  const initialized = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://api.paystack.co")) return realFetch(url, options);
    if (String(url).includes("/transaction/initialize")) {
      initialized.push(JSON.parse(options.body));
      return Response.json({ status: true, data: { authorization_url: "https://checkout.paystack.test/existing" } });
    }
    const reference = decodeURIComponent(String(url).split("/").pop());
    return Response.json({ status: true, data: { reference, status: paymentStatus, amount, currency: "GHS" } });
  });
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { session = "customer", cookie, method = "GET", body, proof = true } = {}) => realFetch(base + path, {
    method, headers: { "X-Session-Domain": session, ...(proof ? customerTabHeaders(session) : {}), ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const cookieFrom = (response, session) => response.headers.getSetCookie().find((v) => v.startsWith(`${session}_token=`))?.split(";")[0];
  const credentials = { email: account.email, password: "OriginalPassword123" };
  const signedIn = await request("/api/auth/customer/login", { method: "POST", body: credentials });
  assert.equal(signedIn.status, 200);
  const customerCookie = cookieFrom(signedIn, "customer");

  await t.test("only an authenticated customer can opt in, with an available plan", async () => {
    for (const options of [{}, { cookie: customerCookie, proof: false }]) {
      assert.equal((await request("/api/auth/customer/become-agent", { ...options, method: "POST", body: { planId: plan.id } })).status, 401);
    }
    assert.equal((await request("/api/auth/customer/become-agent", { cookie: customerCookie, method: "POST", body: { planId: retiredPlan.id } })).status, 404);
    assert.equal((await request("/api/auth/customer/me", { cookie: customerCookie, method: "PUT", body: { customerAccess: true, role: "agent" } })).status, 200);
    assert.equal((await User.findById(account.id)).role, "user");
    assert.equal((await User.findById(account.id)).customerAccess, false);
  });

  let agentCookie;
  await t.test("opt-in reuses identity and credentials; simultaneous clicks do not create accounts", async () => {
    const responses = await Promise.all([1, 2].map(() => request("/api/auth/customer/become-agent", { cookie: customerCookie, method: "POST", body: { planId: plan.id, role: "admin", agentApplication: { status: "approved" } } })));
    for (const response of responses) {
      assert.equal(response.status, 200);
      const user = (await response.json()).data;
      assert.equal(user.id, account.id);
      assert.equal(user.agentApplication.status, "incomplete");
      assert.equal(user.onboarding.step, "subscription");
      agentCookie = cookieFrom(response, "agent");
      assert.ok(agentCookie);
    }
    assert.equal(await User.countDocuments(), 1);
    const user = await User.findById(account.id).select("+password");
    assert.equal(user.password, passwordBefore);
    assert.deepEqual(user.savedProperties.map(String), [String(savedProperty)]);
    assert.equal(user.preferences.offerUpdates, false);
    assert.equal(await Subscription.countDocuments(), 0);
    assert.equal((await request("/api/auth/customer/me", { cookie: customerCookie })).status, 200);
    assert.equal((await request("/api/users/saved", { cookie: customerCookie })).status, 200);
    assert.equal((await request("/api/agents/dashboard", { session: "agent", cookie: agentCookie })).status, 403);
    assert.equal((await request("/api/agents/dashboard", { cookie: customerCookie })).status, 403);
  });

  let reference;
  await t.test("payment uses the server price before profile completion, and pending/failure do not unlock access", async () => {
    const options = { session: "agent", cookie: agentCookie, method: "POST" };
    assert.equal((await request("/api/subscriptions/quote", { ...options, body: { planId: agencyPlan.id } })).status, 403);
    const quote = await request("/api/subscriptions/quote", { ...options, body: { planId: plan.id } });
    assert.equal(quote.status, 200);
    assert.equal((await quote.json()).data.amount, 150);
    const start = await request("/api/subscriptions/initialize", { ...options, body: { planId: plan.id, amount: 1 } });
    assert.equal(start.status, 200);
    reference = (await start.json()).data.reference;
    assert.equal(initialized[0].amount, 15000);
    assert.match(initialized[0].callback_url, /\/agent\/checkout\?reference=/);
    assert.equal((await request("/api/subscriptions/verify", { ...options, body: { reference } })).status, 202);
    paymentStatus = "failed";
    assert.equal((await request("/api/subscriptions/verify", { ...options, body: { reference } })).status, 402);
    assert.equal((await User.findById(account.id)).subscription, null);
    assert.equal((await request("/api/agents/dashboard", { session: "agent", cookie: agentCookie })).status, 403);
  });

  await t.test("verified payment opens the prefilled profile, never another registration or approval", async () => {
    paymentStatus = "success";
    const paid = await request("/api/subscriptions/verify", { session: "agent", cookie: agentCookie, method: "POST", body: { reference } });
    assert.equal(paid.status, 200);
    const user = (await paid.json()).data;
    assert.equal(user.id, account.id);
    assert.equal(user.firstName, "Existing");
    assert.equal(user.onboarding.nextPath, "/agent/onboarding/profile");
    assert.equal(user.agentApplication.status, "incomplete");
    assert.equal(user.subscription.paymentStatus, "paid");
    assert.equal(user.onboarding.dashboardAccess, false);
    agentCookie = cookieFrom(paid, "agent");
    assert.equal((await request("/api/subscriptions/verify", { session: "agent", cookie: agentCookie, method: "POST", body: { reference } })).status, 200);
    const expiresAt = (await Subscription.findOne({ paymentReference: reference })).expiresAt;
    const profile = await request("/api/agents/application", { session: "agent", cookie: agentCookie, method: "PUT", body: { firstName: "Existing", lastName: "Customer", phone: "+233241234567", agentType: "individual", region: "Greater Accra", city: "Accra", yearsExperience: 2, bio: "Helping people find homes in Accra." } });
    assert.equal(profile.status, 200);
    const application = await request("/api/agents/application", { session: "agent", cookie: agentCookie });
    assert.equal(application.status, 200);
    assert.equal((await application.json()).data.user.agentApplication.status, "pending");
    assert.equal((await Subscription.findOne({ paymentReference: reference })).expiresAt.getTime(), expiresAt.getTime());
    assert.equal((await request("/api/agents/dashboard", { session: "agent", cookie: agentCookie })).status, 403);
  });

  await t.test("the same email/password works in both areas; customer sessions cannot use owner powers", async () => {
    for (const session of ["customer", "agent"]) {
      const response = await request(`/api/auth/${session}/login`, { session, method: "POST", body: credentials });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.id, account.id);
      assert.ok(cookieFrom(response, session));
    }
    const ownerMessages = await request("/api/conversations?scope=owner", { cookie: customerCookie });
    assert.equal(ownerMessages.status, 200);
    assert.deepEqual((await ownerMessages.json()).data, []);
    const stranger = new mongoose.Types.ObjectId();
    const record = { owner: account._id, ownerType: "agent", customer: stranger, property: new mongoose.Types.ObjectId(), amount: 100, status: "pending" };
    const offer = await mongoose.connection.db.collection("offers").insertOne(record);
    const conversation = await mongoose.connection.db.collection("conversations").insertOne(record);
    assert.equal((await request(`/api/offers/${offer.insertedId}`, { cookie: customerCookie })).status, 404);
    assert.equal((await request(`/api/conversations/${conversation.insertedId}`, { cookie: customerCookie })).status, 404);
    const me = await request("/api/auth/customer/me", { cookie: customerCookie });
    assert.equal(me.status, 200);
    assert.deepEqual((await me.json()).data.savedProperties, [String(savedProperty)]);
    const resumed = await request("/api/auth/customer/become-agent", { cookie: customerCookie, method: "POST", body: { planId: plan.id } });
    assert.equal(resumed.status, 200);
    assert.equal((await resumed.json()).data.agentApplication.status, "pending");
    assert.equal(await User.countDocuments(), 1);
  });

  await t.test("returning after closing the payment tab reconciles payment and resumes profile completion", async () => {
    const other = await User.create({ firstName: "Another", lastName: "Customer", email: "another@example.test", password: "OriginalPassword123", role: "agent", customerAccess: true, agentApplication: { status: "incomplete", agentType: "agency" } });
    const attempt = await Subscription.create({ user: other.id, plan: agencyPlan.id, planName: agencyPlan.name, accountType: "agency", amount: 500, paymentReference: "customer-agent-recovery", paymentStatus: "pending" });
    amount = 50000;
    const signIn = await request("/api/auth/agent/login", { session: "agent", method: "POST", body: { email: other.email, password: "OriginalPassword123" } });
    assert.equal(signIn.status, 200);
    const response = await request("/api/agents/application", { session: "agent", cookie: cookieFrom(signIn, "agent") });
    assert.equal(response.status, 200);
    assert.equal((await Subscription.findById(attempt.id)).paymentStatus, "paid");
    assert.equal((await User.findById(other.id)).agentApplication.status, "incomplete");
    assert.equal((await response.json()).data.user.onboarding.nextPath, "/agent/onboarding/profile");
    assert.equal(await User.countDocuments({ email: other.email }), 1);
  });
});
