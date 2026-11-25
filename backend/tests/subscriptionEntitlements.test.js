import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import mongoose from "mongoose";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import Subscription from "../models/Subscription.js";
import Conversation from "../models/Conversation.js";
import chatRoutes from "../routes/chatRoutes.js";
import agentRoutes from "../routes/agentRoutes.js";
import { quotePlan } from "../utils/planChange.js";
import { chatEnabledAgents, withinImageLimit } from "../utils/permissions.js";
import { fakeListedAgents } from "./support/listedAgents.js";
import { TEST_SESSION } from "./support/sessions.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
// A chainable, awaitable stand-in for a Mongoose query
const q = (value) => {
  const promise = Promise.resolve(value);
  const self = { then: promise.then.bind(promise), catch: promise.catch.bind(promise), select: () => self, populate: () => self, sort: () => self, limit: () => self, skip: () => self, lean: () => self };
  return self;
};
const plan = (fields) => new Plan({ name: `Plan ${Math.random()}`, price: 100, duration: 30, propertyLimit: 5, imageLimit: 2, ...fields });
const agent = (fields = {}) => new User({ emailVerifiedAt: new Date(), firstName: "Akua", lastName: "Mensah", email: `${Math.random()}@example.test`, role: "agent", isActive: true, agentApplication: { status: "approved", agentType: "individual" }, ...fields });
const activeSub = (user, forPlan, fields = {}) => new Subscription({ user: user._id, plan: forPlan, planName: forPlan.name, status: "active", paymentStatus: "paid", amount: forPlan.price, planPrice: forPlan.price, durationDays: forPlan.duration, paymentReference: `R${Math.random()}`, startDate: new Date(NOW.getTime() - 15 * DAY), expiresAt: new Date(NOW.getTime() + 15 * DAY), ...fields });
const settingsDoc = (agentSettings = { requireSubscription: true }) => q({ key: "platform", agent: agentSettings });

test("plan pricing is worked out on the server from the agent's records", async (t) => {
  const starter = plan({ name: "Starter", price: 300, duration: 30, sortOrder: 1 });
  const pro = plan({ name: "Professional", price: 400, duration: 90, internalChat: true, sortOrder: 2 });
  const elite = plan({ name: "Elite", price: 300, duration: 30, sortOrder: 3 }); // higher tier, cheaper than the credit
  const agencyPlan = plan({ name: "Agency Business", accountType: "agency", price: 1500, duration: 90, sortOrder: 1 });
  let current = null;
  t.mock.method(Subscription, "findById", () => ({ populate: async () => current }));

  await t.test("a first subscription costs the full price", async () => {
    const user = agent();
    const quote = await quotePlan(user, starter, NOW);
    assert.equal(quote.kind, "new");
    assert.equal(quote.amount, 300);
    assert.equal(quote.expiresAt.getTime(), NOW.getTime() + 30 * DAY);
  });

  await t.test("renewing the same plan costs the full price and extends the end date", async () => {
    const user = agent();
    current = activeSub(user, starter);
    user.subscription = current._id;
    const quote = await quotePlan(user, starter, NOW);
    assert.equal(quote.kind, "renewal");
    assert.equal(quote.amount, 300);
    assert.equal(quote.expiresAt.getTime(), current.expiresAt.getTime() + 30 * DAY);
  });

  await t.test("an upgrade credits the unused value of the current plan", async () => {
    const user = agent();
    current = activeSub(user, starter); // 15 of 30 days left on a 300 plan: 150 unused
    user.subscription = current._id;
    const quote = await quotePlan(user, pro, NOW);
    assert.equal(quote.kind, "upgrade");
    assert.equal(quote.credit, 150);
    assert.equal(quote.amount, 250);
    assert.equal(quote.remainingDays, 15);
    assert.equal(quote.expiresAt.getTime(), NOW.getTime() + 90 * DAY);
  });

  await t.test("the credit never makes the price negative, and free admin grants carry no credit", async () => {
    const user = agent();
    current = activeSub(user, pro, { planPrice: 400, durationDays: 90, expiresAt: new Date(NOW.getTime() + 80 * DAY) });
    user.subscription = current._id;
    assert.equal((await quotePlan(user, elite, NOW)).amount, 0);
    current = activeSub(user, pro, { paymentStatus: "waived", amount: 0, planPrice: undefined });
    assert.equal((await quotePlan(user, elite, NOW)).credit, 0);
  });

  await t.test("while a plan is active, a lower or equal tier isn't an upgrade", async () => {
    const user = agent();
    current = activeSub(user, pro);
    user.subscription = current._id;
    await assert.rejects(quotePlan(user, starter, NOW), { status: 400 }, "lower tier");
    const sameTier = plan({ name: "Pro Annual", price: 1200, duration: 365, sortOrder: 2 });
    await assert.rejects(quotePlan(user, sameTier, NOW), { status: 400 }, "same tier, even at a higher price");
    current = activeSub(user, pro, { expiresAt: new Date(NOW.getTime() - DAY), status: "expired" });
    assert.equal((await quotePlan(user, starter, NOW)).kind, "new", "once it has ended, any plan of the type can be chosen");
  });

  await t.test("older records without a stored plan price use the amount charged", async () => {
    const user = agent();
    current = activeSub(user, starter, { planPrice: undefined, durationDays: undefined, amount: 300 });
    current.plan = starter; // populated, as the query returns it
    user.subscription = current._id;
    assert.equal((await quotePlan(user, pro, NOW)).credit, 150);
  });

  await t.test("account types: every account only buys plans of its own type", async () => {
    current = null;
    await assert.rejects(quotePlan(agent({ agentApplication: { status: "approved", agentType: "agency" } }), starter, NOW), { status: 403 });
    await assert.rejects(quotePlan(agent({ agentApplication: { status: "incomplete", agentType: "individual" } }), agencyPlan, NOW), { status: 403 });
    await assert.rejects(quotePlan(agent(), agencyPlan, NOW), { status: 403 }, "approved individuals can't buy agency plans either");
    assert.equal((await quotePlan(agent({ agentApplication: { status: "approved", agentType: "agency" } }), agencyPlan, NOW)).accountType, "agency");
  });
});

test("photo limits keep existing photos after a downgrade but block new ones", () => {
  const kept = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"];
  assert.equal(withinImageLimit(["new1", "new2"], 2), true);
  assert.equal(withinImageLimit(["new1", "new2", "new3"], 2), false, "a manipulated request with more photos is rejected");
  assert.equal(withinImageLimit(kept, 2, kept), true, "an over-limit gallery can be saved unchanged");
  assert.equal(withinImageLimit(["b.jpg", "a.jpg", "d.jpg"], 2, kept), true, "and reordered or trimmed");
  assert.equal(withinImageLimit([...kept.slice(0, 3), "data:image/jpeg;base64,new"], 2, kept), false, "but can't take a new photo");
  assert.equal(withinImageLimit([...kept, "a.jpg"], 2, kept), false, "or grow by repeating one");
});

test("NyaFie chat follows the agent's active plan", async (t) => {
  t.mock.method(Setting, "findOneAndUpdate", () => settingsDoc());
  const withChat = plan({ internalChat: true });
  const withoutChat = plan({ internalChat: false });
  const subs = [];
  const make = (forPlan, fields) => {
    const user = agent();
    const sub = activeSub(user, forPlan, { startDate: new Date(Date.now() - DAY), expiresAt: new Date(Date.now() + DAY), ...fields });
    sub.plan = forPlan;
    user.subscription = sub._id;
    subs.push(sub);
    return user;
  };
  const pro = make(withChat), starter = make(withoutChat), expired = make(withChat, { expiresAt: new Date(Date.now() - DAY) });
  t.mock.method(Subscription, "find", () => q(subs));
  const enabled = await chatEnabledAgents([pro, starter, expired]);
  assert.deepEqual([...enabled], [String(pro._id)], "only an active plan with chat enables it; expiry locks it");
});

test("the chat API refuses agents whose plan has no chat, whatever the client sends", async (t) => {
  process.env.JWT_KEY = "subscription-entitlements-test-key";
  t.mock.method(Setting, "findOneAndUpdate", () => settingsDoc());
  const starterPlan = plan({ internalChat: false });
  const starterAgent = agent();
  const sub = activeSub(starterAgent, starterPlan, { startDate: new Date(Date.now() - DAY), expiresAt: new Date(Date.now() + DAY) });
  sub.plan = starterPlan;
  starterAgent.subscription = sub._id;
  const customer = new User({ emailVerifiedAt: new Date(), firstName: "Ama", lastName: "Owusu", email: "ama@example.test", role: "user", isActive: true });
  const listing = new Property({ title: "Starter listing", owner: starterAgent._id, ownerType: "agent", status: "published", listingType: "Rent", price: 2000 });
  const conversation = new Conversation({ property: listing._id, customer: customer._id, owner: starterAgent._id, ownerType: "agent", status: "open" });
  const users = [customer, starterAgent];

  t.mock.method(User, "findById", (id) => q(users.find((u) => String(u._id) === String(id))));
  t.mock.method(User, "find", () => q([starterAgent]));
  t.mock.method(User, "aggregate", fakeListedAgents([starterAgent]));
  t.mock.method(Subscription, "find", () => q([sub]));
  t.mock.method(Subscription, "findById", () => q(sub));
  t.mock.method(Property, "findOne", () => q(listing));
  t.mock.method(Conversation, "findById", () => q(conversation));
  const created = t.mock.method(Conversation, "findOneAndUpdate", () => q(conversation));

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/conversations", chatRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/conversations`;
  const cookie = (user, session) => `${session}_token=${jwt.sign({ id: String(user._id), role: user.role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" })}`;
  const post = (path, user, session, body) => fetch(`${base}${path}`, { method: "POST", headers: { ...customerTabHeaders(session), "Content-Type": "application/json", "X-Session-Domain": session, Cookie: cookie(user, session) }, body: JSON.stringify(body) });

  const start = await post("", customer, "customer", { propertyId: String(listing._id), message: "Is it available?", internalChat: true });
  assert.equal(start.status, 403);
  assert.match((await start.json()).message, /inquiry/);
  assert.equal(created.mock.callCount(), 0, "no conversation is opened");

  for (const [user, session] of [[starterAgent, "agent"], [customer, "customer"]]) {
    const reply = await post(`/${conversation._id}/messages`, user, session, { message: "Hello" });
    assert.equal(reply.status, 403, `${session} cannot message in a locked conversation`);
    assert.match((await reply.json()).message, session === "agent" ? /Upgrade your subscription/ : /isn.t using NyaFie chat/);
  }
});

test("approved agents can't change their account type by editing their profile", async (t) => {
  process.env.JWT_KEY = "subscription-entitlements-test-key";
  t.mock.method(Setting, "findOneAndUpdate", () => settingsDoc());
  const individual = agent({ phone: "+233241234567" });
  t.mock.method(User, "findById", () => q(individual));
  t.mock.method(Subscription, "findById", () => q(null));
  t.mock.method(Property, "countDocuments", async () => 0);
  let saved;
  t.mock.method(User, "findOneAndUpdate", (filter, update) => { saved = update.$set; return q(null); });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/agents", agentRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const token = jwt.sign({ sid: TEST_SESSION, id: String(individual._id), role: "agent", session: "agent" }, process.env.JWT_KEY, { expiresIn: "1h" });
  await fetch(`http://127.0.0.1:${server.address().port}/api/agents/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Session-Domain": "agent", Cookie: `agent_token=${token}` },
    body: JSON.stringify({ agentType: "agency", companyName: "Free Upgrade Ltd", officeAddress: "1 Main St", firstName: "Akua", lastName: "Mensah", phone: "+233241234567", region: "Greater Accra", city: "Accra", bio: "Independent agent in Accra.", yearsExperience: 3 }),
  });
  assert.ok(saved, "the profile update ran");
  assert.equal(saved["agentApplication.agentType"], "individual");
  assert.equal(saved["agentApplication.companyName"], "");
});
