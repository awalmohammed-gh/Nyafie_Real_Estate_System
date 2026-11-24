import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import Plan from "../models/Plan.js";
import Property from "../models/Property.js";
import Setting, { clearSettingsCache } from "../models/Setting.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import Viewing from "../models/Viewing.js";
import { cookieName } from "../utils/generateToken.js";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("someone who registered directly as an agent is a customer too, with the same rules as everyone", { skip: process.env.RUN_AGENT_CUSTOMERS_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  await isolatedMongo(t);
  const oldKey = process.env.JWT_KEY;
  process.env.JWT_KEY = "isolated-agent-customers-signing-key-32";
  t.after(() => { if (oldKey === undefined) delete process.env.JWT_KEY; else process.env.JWT_KEY = oldKey; });
  await Setting.create({ key: "platform", agent: { requireSubscription: true } });
  const password = "OriginalPassword123";
  const person = (name, fields = {}) => User.create({ firstName: name, lastName: "Agent", email: `${name.toLowerCase()}@agents.test`, phone: "0241234567", password, emailVerifiedAt: new Date(), role: "agent", agentApplication: { status: "approved", agentType: "individual", profileCompletedAt: new Date(), proofCount: 1 }, ...fields });
  const plan = await Plan.create({ name: "Agency", accountType: "agency", price: 100, duration: 30, propertyLimit: 10, imageLimit: 5 });
  const subscribe = async (user) => { const sub = await Subscription.create({ user: user.id, plan: plan.id, planName: plan.name, amount: 100, paymentReference: "SUB-" + user.id, paymentStatus: "paid", status: "active", startDate: new Date(), expiresAt: new Date(Date.now() + 86400000 * 20), paidAt: new Date(), environment: "test" }); await User.updateOne({ _id: user.id }, { subscription: sub.id }); };
  const ama = await person("Ama", { agentApplication: { status: "approved", agentType: "agency", companyName: "Ama Homes", profileCompletedAt: new Date(), proofCount: 1 } });
  const staff = await person("Staff", { agency: { owner: ama._id, role: "agent" } });
  const kofi = await person("Kofi");
  await subscribe(ama); await subscribe(kofi);
  const listing = (owner, title, extra = {}) => Property.create({ title, description: "A home in Accra with room for a family to live.", price: 400, pricePeriod: "total", propertyType: "Villa", listingType: "Sale", currency: "GHS", ownerType: "agent", owner: owner._id, status: "published", images: ["/home.jpg"], location: { neighbourhood: "Osu", city: "Accra", address: "1 Road" }, ...extra });
  const amasHome = await listing(ama, "Ama's home"), kofisHome = await listing(kofi, "Kofi's home");

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (session, path, { cookie = "", body, method = body ? "POST" : "GET" } = {}) => {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": session, ...customerTabHeaders(session), Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cookies: response.headers.getSetCookie() };
  };
  const login = async (user, session = "customer") => { const done = await call(session, `/auth/${session}/login`, { body: { email: user.email, password } }); return { ...done, cookie: done.cookies[0]?.split(";")[0] || "" }; };

  await t.test("the same email and password open the customer area, and nothing of the agent area", async () => {
    const signedIn = await login(kofi);
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.body.data.id, kofi.id);
    assert.deepEqual(signedIn.cookies.map((value) => value.split("=")[0]), ["customer_token"]);
    assert.equal((await call("customer", "/users/saved", { cookie: signedIn.cookie })).status, 200);
    assert.equal((await call("customer", "/agents/dashboard", { cookie: signedIn.cookie })).status, 403);
    assert.equal((await call("agent", "/agents/dashboard", { cookie: signedIn.cookie })).status, 401);
    const stored = await User.findById(kofi.id);
    assert.equal(stored.role, "agent");
    assert.equal(stored.customerAccess, false, "their account isn't changed");
  });

  await t.test("they deal with other people's listings, never their own or their agency's", async () => {
    const offer = (property) => ({ propertyId: property.id, amount: 350, name: "Kofi Agent", email: kofi.email, phone: "0241234567", message: "I would like to buy this home." });
    const kofiCookie = (await login(kofi)).cookie, staffCookie = (await login(staff)).cookie;
    for (const [cookie, property] of [[kofiCookie, kofisHome], [staffCookie, amasHome]]) {
      const own = await call("customer", "/offers", { cookie, body: offer(property) });
      assert.equal(own.status, 400);
      assert.match(own.body.message, /own listing/);
      const review = await call("customer", `/properties/${property.id}/reviews`, { cookie, body: { rating: 5, title: "Great", comment: "The best home I have ever seen here." } });
      assert.equal(review.status, 403);
      assert.match(review.body.message, /own listing/);
    }
    // Having viewed it before joining doesn't let staff review their agency's home
    await Viewing.collection.insertOne({ customer: staff._id, property: amasHome._id, owner: ama._id, ownerType: "agent", status: "completed" });
    assert.equal((await call("customer", `/properties/${amasHome.id}/reviews`, { cookie: staffCookie, body: { rating: 5, title: "Great", comment: "The best home I have ever seen here." } })).status, 403);
    assert.equal((await call("customer", `/properties/${amasHome.id}/reviews`, { cookie: staffCookie })).body.data.canReview, false);
    const made = await call("customer", "/offers", { cookie: kofiCookie, body: offer(amasHome) });
    assert.notEqual(made.body.message, "This is your own listing.", "another agent's listing is fine");
    assert.equal(made.status, 201, JSON.stringify(made.body));
  });

  await t.test("suspended and removed agents lose the customer area at once", async () => {
    const before = (await login(kofi)).cookie;
    await User.updateOne({ _id: kofi.id }, { isActive: false, "agentApplication.status": "suspended" });
    assert.equal((await call("customer", "/auth/customer/me", { cookie: before })).status, 401);
    assert.equal((await login(kofi)).status, 401);
    await User.updateOne({ _id: kofi.id }, { isActive: true, "agentApplication.status": "removed" });
    assert.equal((await call("customer", "/auth/customer/me", { cookie: before })).status, 401);
    assert.equal((await login(kofi)).status, 403);
    await User.updateOne({ _id: kofi.id }, { "agentApplication.status": "approved" });
    assert.equal((await login(kofi)).status, 200);
  });

  await t.test("an unproved email asks for a code, and admins stay out", async () => {
    const unproved = await person("Unproved", { emailVerifiedAt: null });
    assert.equal((await login(unproved)).status === 200 && Boolean((await login(unproved)).cookie), false);
    const admin = await person("Admin", { role: "admin", agentApplication: undefined });
    assert.equal((await login(admin)).status, 401);
    const forged = `${cookieName("customer")}=` + jwt.sign({ id: admin.id, role: "user", session: "customer", ...customerTabClaims("customer") }, process.env.JWT_KEY, { expiresIn: "1h" });
    assert.equal((await call("customer", "/auth/customer/me", { cookie: forged })).status, 401);
  });

  await t.test("the onboarding order doesn't change: direct agents do the profile first, customers the plan", async () => {
    const direct = await person("Direct", { agentApplication: { status: "incomplete", agentType: "individual" } });
    const step = async (user) => (await call("agent", "/auth/agent/me", { cookie: (await login(user, "agent")).cookie })).body.data.onboarding;
    assert.deepEqual([(await step(direct)).step, (await step(direct)).paymentFirst], ["profile", false]);
    await login(direct); // using the customer area changes nothing
    assert.deepEqual([(await step(direct)).step, (await step(direct)).paymentFirst], ["profile", false]);
    const started = await person("Started", { customerAccess: true, agentApplication: { status: "incomplete", agentType: "individual" } });
    assert.deepEqual([(await step(started)).step, (await step(started)).paymentFirst], ["subscription", true]);
    // "List your property" from the customer area opens their own onboarding, without a plan and in their order
    const opened = await call("customer", "/auth/customer/become-agent", { cookie: (await login(direct)).cookie, body: {} });
    assert.equal(opened.status, 200);
    assert.equal(opened.body.data.onboarding.step, "profile");
    assert.equal((await User.findById(direct.id)).customerAccess, false);
    clearSettingsCache();
  });

  await t.test("signing out of either area signs them out of both", async () => {
    const both = `${(await login(ama)).cookie}; ${(await login(ama, "agent")).cookie}`;
    for (const session of ["customer", "agent"]) {
      const done = await call(session, `/auth/${session}/logout`, { cookie: both, method: "POST" });
      assert.deepEqual(done.cookies.map((value) => value.split("=")[0]).sort(), ["agent_token", "customer_token"]);
    }
  });
});
