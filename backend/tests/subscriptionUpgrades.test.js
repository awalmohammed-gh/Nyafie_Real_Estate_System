import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Setting from "../models/Setting.js";
import Subscription from "../models/Subscription.js";
import subscriptionRoutes from "../routes/subscriptionRoutes.js";

const DAY = 24 * 60 * 60 * 1000;
// A chainable, awaitable stand-in for a Mongoose query
const q = (value) => {
  const promise = Promise.resolve(value);
  const self = { then: promise.then.bind(promise), catch: promise.catch.bind(promise), select: () => self, populate: () => self, sort: () => self, limit: () => self, skip: () => self, lean: () => self };
  return self;
};
const idOf = (value) => String(value?._id ?? value);
const byId = (list, value) => list.find((item) => String(item._id) === idOf(value)) || null;
const plan = (name, accountType, sortOrder, fields = {}) => new Plan({ name, accountType, sortOrder, price: 1000 * sortOrder, duration: 30, propertyLimit: 50 * sortOrder, imageLimit: 10, teamMemberLimit: accountType === "individual" ? 0 : 5 * sortOrder, ...fields });
const provider = (type, fields = {}) => new User({ firstName: "Test", lastName: type, email: `${Math.random()}@example.test`, phone: "+233241234567", role: "agent", isActive: true, agentApplication: { status: "approved", agentType: type, companyName: type === "individual" ? "" : `${type} Ltd`, profileCompletedAt: new Date() }, ...fields });

test("plan upgrades: only higher plans of the provider's own type, priced and confirmed by the server", async (t) => {
  process.env.JWT_KEY = "subscription-upgrades-test-key";
  const savedKey = process.env.Test_Secret_Key;
  process.env.Test_Secret_Key = "sk_test_upgrades";
  t.after(() => { process.env.Test_Secret_Key = savedKey; });

  const indStarter = plan("Individual Basic", "individual", 1);
  const indPro = plan("Individual Pro", "individual", 2);
  const agStarter = plan("Agency Starter", "agency", 1);
  const agGrowth = plan("Agency Growth", "agency", 2);
  const coStarter = plan("Company Starter", "company", 1);
  const coGrowth = plan("Company Growth", "company", 2);
  const coPro = plan("Company Pro", "company", 3);
  const coRetired = plan("Company Elite", "company", 4, { isActive: false });
  const plans = [indStarter, indPro, agStarter, agGrowth, coStarter, coGrowth, coPro, coRetired];

  const subs = [];
  const subscribe = (user, forPlan, fields = {}) => {
    // 15 of 30 days left, paid at the plan's price
    const sub = new Subscription({ user: user._id, plan: forPlan, planName: forPlan.name, accountType: forPlan.accountType, status: "active", paymentStatus: "paid", amount: forPlan.price, planPrice: forPlan.price, durationDays: forPlan.duration, paymentReference: `R${Math.random()}`, startDate: new Date(Date.now() - 15 * DAY), expiresAt: new Date(Date.now() + 15 * DAY), ...fields });
    t.mock.method(sub, "save", async () => sub);
    user.subscription = sub._id;
    subs.push(sub);
    return sub;
  };
  const individual = provider("individual");
  const agency = provider("agency");
  const company = provider("company");
  const topCompany = provider("company");
  const manager = provider("company", { agency: { owner: company._id, role: "manager" } });
  const users = [individual, agency, company, topCompany, manager];
  users.forEach((user) => t.mock.method(user, "save", async () => user));
  subscribe(individual, indStarter);
  subscribe(agency, agStarter);
  const companySub = subscribe(company, coGrowth);
  subscribe(topCompany, coPro);

  t.mock.method(Setting, "findOneAndUpdate", () => q({ key: "platform", agent: { requireSubscription: true }, payments: { subscriptionsEnabled: true } }));
  t.mock.method(User, "findById", (id) => {
    const user = byId(users, id);
    const self = q(user);
    // populate("subscription") swaps the id for the record, as Mongoose does
    self.populate = (path) => { if (path === "subscription" && user?.subscription) user.subscription = byId(subs, user.subscription) || user.subscription; return self; };
    return self;
  });
  t.mock.method(User, "findOneAndUpdate", async () => null);
  t.mock.method(Plan, "findById", (id) => q(byId(plans, id)));
  t.mock.method(Plan, "find", (filter) => q(plans.filter((p) => p.isActive === filter.isActive && p.accountType === filter.accountType && p.sortOrder > filter.sortOrder.$gt).sort((a, b) => a.sortOrder - b.sortOrder)));
  t.mock.method(Subscription, "findById", (id) => q(byId(subs, id)));
  let verifying = null;
  t.mock.method(Subscription, "findOne", (filter) => q(filter?.paymentReference ? subs.find((s) => s.paymentReference === filter.paymentReference && idOf(s.user) === idOf(filter.user)) || null : verifying));
  const created = [];
  t.mock.method(Subscription, "create", async (doc) => {
    const sub = new Subscription(doc);
    t.mock.method(sub, "save", async () => sub);
    created.push(sub);
    subs.push(sub);
    return sub;
  });

  // Paystack: checkout starts; verification answers with whatever the test sets
  const realFetch = globalThis.fetch;
  const charges = [];
  let paystackSays = () => ({ status: "abandoned", amount: 0 });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://api.paystack.co")) return realFetch(url, options);
    if (String(url).includes("/transaction/initialize")) {
      charges.push(JSON.parse(options.body));
      return Response.json({ status: true, data: { authorization_url: "https://checkout.paystack.test/x" } });
    }
    const reference = decodeURIComponent(String(url).split("/").pop());
    return Response.json({ status: true, data: { reference, currency: "GHS", ...paystackSays(reference) } });
  });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/subscriptions", subscriptionRoutes);
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ success: false, message: err.message })); // eslint-disable-line no-unused-vars
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/subscriptions`;
  const as = (user) => async (method, path, body) => {
    const response = await realFetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": "agent", Cookie: `agent_token=${jwt.sign({ id: String(user._id), role: "agent", session: "agent" }, process.env.JWT_KEY, { expiresIn: "1h" })}` }, body: body && JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const upgrade = (user, target, extra = {}) => as(user)("POST", "/upgrade", { planId: String(target._id), ...extra });

  await t.test("the upgrade list only has higher, active plans of the provider's own type", async () => {
    const { status, body } = await as(company)("GET", "/upgrades");
    assert.equal(status, 200);
    assert.deepEqual(body.data.upgrades.map((u) => u.plan.name), ["Company Pro"], "not Starter (lower), Growth (current), Elite (inactive) or other types");
    assert.equal(body.data.highest, false);
    assert.equal(body.data.upgrades[0].quote.kind, "upgrade");
    assert.equal(body.data.upgrades[0].quote.credit, 1000, "half of the ₵2,000 Growth period is left");
    assert.equal(body.data.upgrades[0].quote.amount, 2000);
    const top = await as(topCompany)("GET", "/upgrades");
    assert.equal(top.body.data.highest, true, "Company Pro is the highest active company plan");
    assert.deepEqual(top.body.data.upgrades, []);
  });

  await t.test("an individual can upgrade to a higher individual plan", async () => {
    const { status, body } = await upgrade(individual, indPro);
    assert.equal(status, 200);
    assert.equal(body.data.mode, "paystack");
    const record = created.at(-1);
    assert.equal(record.kind, "upgrade");
    assert.equal(record.previousPlanName, "Individual Basic");
    assert.equal(record.amount, 1500, "₵2,000 less ₵500 credit for the unused half of Basic");
    assert.equal(charges.at(-1).amount, 150000, "Paystack is asked for the same amount, in pesewas");
    assert.equal(record.status, "pending", "nothing changes until the payment is confirmed");
    assert.notEqual(idOf(individual.subscription), String(record._id));
  });

  await t.test("plans of another account type are refused, whatever id is sent", async () => {
    const before = created.length;
    for (const [user, target, label] of [[individual, agGrowth, "individual → agency"], [individual, coPro, "individual → company"], [agency, coPro, "agency → company"], [agency, indPro, "agency → individual"], [company, indPro, "company → individual"], [company, agGrowth, "company → agency"]]) {
      const attempt = await upgrade(user, target);
      assert.equal(attempt.status, 403, label);
      assert.match(attempt.body.message, /Invalid plan for this provider type/);
      assert.equal((await as(user)("POST", "/initialize", { planId: String(target._id) })).status, 403, `${label} through checkout`);
      assert.equal((await as(user)("POST", "/quote", { planId: String(target._id) })).status, 403, `${label} quote`);
    }
    assert.equal(created.length, before, "no payment record is created");
    assert.equal(charges.length, 1, "and Paystack is never called");
  });

  await t.test("a lower plan, the same plan or an inactive plan isn't an upgrade", async () => {
    const before = created.length;
    assert.equal((await upgrade(company, coStarter)).status, 400, "lower plan through a manipulated request");
    assert.equal((await as(company)("POST", "/initialize", { planId: String(coStarter._id) })).status, 400, "or through checkout");
    const same = await upgrade(company, coGrowth);
    assert.equal(same.status, 400, "the current plan is a renewal, not an upgrade");
    assert.match(same.body.message, /Renew/);
    assert.equal((await upgrade(company, coRetired)).status, 404, "an inactive plan, even a higher one");
    assert.equal(created.length, before);
  });

  await t.test("managers and other staff can't upgrade the organisation's plan", async () => {
    assert.equal((await upgrade(manager, coPro)).status, 403);
    assert.equal((await as(manager)("GET", "/upgrades")).status, 403);
    assert.equal(String(company.subscription), String(companySub._id));
  });

  await t.test("prices, tiers and limits sent by the browser are ignored", async () => {
    const { status } = await upgrade(company, coPro, { price: 1, amount: 1, tierRank: 99, sortOrder: 99, accountType: "individual", providerType: "individual", duration: 3650, listingLimit: 9999, teamMemberLimit: 9999 });
    assert.equal(status, 200);
    const record = created.at(-1);
    assert.equal(record.amount, 2000);
    assert.equal(charges.at(-1).amount, 200000);
    assert.equal(record.durationDays, 30);
    assert.equal(record.accountType, "company");
  });

  await t.test("a faked or underpaid payment doesn't upgrade anything", async () => {
    const pending = created.at(-1);
    paystackSays = () => ({ status: "abandoned", amount: 0 });
    let result = await as(company)("POST", "/verify", { reference: pending.paymentReference });
    assert.equal(result.status, 402);
    paystackSays = () => ({ status: "success", amount: 100 }); // ₵1 paid for a ₵2,000 upgrade
    result = await as(company)("POST", "/verify", { reference: pending.paymentReference });
    assert.equal(result.status, 402);
    assert.equal(pending.status, "pending");
    assert.equal(idOf(company.subscription), String(companySub._id), "still on Company Growth");
    assert.equal(companySub.status, "active");
    // Another provider can't confirm this payment either
    assert.equal((await as(topCompany)("POST", "/verify", { reference: pending.paymentReference })).status, 404);
  });

  await t.test("a confirmed payment upgrades the plan and keeps the old one in the history", async () => {
    const pending = created.at(-1);
    paystackSays = () => ({ status: "success", amount: 200000 });
    const result = await as(company)("POST", "/verify", { reference: pending.paymentReference });
    assert.equal(result.status, 200);
    assert.equal(pending.status, "active");
    assert.equal(pending.paymentStatus, "paid");
    assert.equal(idOf(company.subscription), String(pending._id), "Company Pro is now the one active plan");
    assert.equal(String(pending.previousSubscription), String(companySub._id));
    assert.equal(companySub.status, "cancelled", "Company Growth stays in the history, no longer active");
    assert.ok(pending.expiresAt.getTime() > Date.now() + 29 * DAY, "the new plan runs its full period from today");
  });
});
