import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import Subscription from "../models/Subscription.js";
import TeamInvite from "../models/TeamInvite.js";
import agentRoutes from "../routes/agentRoutes.js";
import propertyRoutes from "../routes/propertyRoutes.js";
import subscriptionRoutes from "../routes/subscriptionRoutes.js";

const DAY = 24 * 60 * 60 * 1000;
const q = (value) => {
  const promise = Promise.resolve(value);
  const self = { then: promise.then.bind(promise), catch: promise.catch.bind(promise), select: () => self, populate: () => self, sort: () => self, limit: () => self, skip: () => self, lean: () => self };
  return self;
};
const plan = (fields) => new Plan({ name: `Plan ${Math.random()}`, duration: 30, imageLimit: 5, ...fields });
const agent = (type, fields = {}) => new User({ firstName: "Test", lastName: type, email: `${Math.random()}@example.test`, phone: "+233241234567", role: "agent", isActive: true, agentApplication: { status: "approved", agentType: type, companyName: type === "individual" ? "" : `${type} Ltd`, profileCompletedAt: new Date() }, ...fields });

test("company plans: eligibility, limits, team, billing and payments are enforced on the server", async (t) => {
  process.env.JWT_KEY = "company-plans-test-key";
  const savedKey = process.env.Test_Secret_Key;
  process.env.Test_Secret_Key = "sk_test_company_plans";
  t.after(() => { process.env.Test_Secret_Key = savedKey; });

  const individualPlan = plan({ name: "Starter", accountType: "individual", price: 150, propertyLimit: 5 });
  const agencyPlan = plan({ name: "Agency Starter", accountType: "agency", price: 600, propertyLimit: 25, teamMemberLimit: 3 });
  const companyPlan = plan({ name: "Company Starter", accountType: "company", price: 2000, propertyLimit: 2, teamMemberLimit: 1 });
  const plans = [individualPlan, agencyPlan, companyPlan];
  const subFor = (user, forPlan, expiresAt) => {
    const sub = new Subscription({ user: user._id, plan: forPlan, planName: forPlan.name, accountType: forPlan.accountType, status: "active", paymentStatus: "paid", amount: forPlan.price, planPrice: forPlan.price, durationDays: forPlan.duration, paymentReference: `R${Math.random()}`, startDate: new Date(Date.now() - 5 * DAY), expiresAt });
    user.subscription = sub._id;
    return sub;
  };
  const individual = agent("individual");
  const agency = agent("agency");
  const company = agent("company");
  const expiredCompany = agent("company");
  const manager = agent("company", { agency: { owner: company._id, role: "manager" } });
  const subs = [subFor(company, companyPlan, new Date(Date.now() + 20 * DAY)), subFor(expiredCompany, companyPlan, new Date(Date.now() - DAY))];
  const users = [individual, agency, company, expiredCompany, manager];
  const byId = (list, value) => list.find((item) => String(item._id) === String(value)) || null;

  t.mock.method(Setting, "findOneAndUpdate", () => q({ key: "platform", agent: { requireSubscription: true }, payments: { subscriptionsEnabled: true } }));
  t.mock.method(User, "findById", (id) => q(byId(users, id)));
  t.mock.method(User, "countDocuments", async (filter) => users.filter((u) => String(u.agency?.owner) === String(filter["agency.owner"])).length);
  t.mock.method(Plan, "findById", (id) => q(byId(plans, id)));
  t.mock.method(Subscription, "findById", (id) => q(byId(subs, id)));
  t.mock.method(Subscription, "findOne", () => q(null));
  const created = [];
  t.mock.method(Subscription, "create", async (doc) => { const sub = new Subscription(doc); created.push(sub); subs.push(sub); return sub; });
  t.mock.method(TeamInvite, "countDocuments", async () => 0);
  let listingCount = 0;
  t.mock.method(Property, "countDocuments", async () => listingCount);
  const properties = [];
  t.mock.method(Property, "create", async (doc) => { const property = new Property(doc); properties.push(property); return property; });

  // Paystack: initialize succeeds; verification reports the payment as abandoned (never paid)
  const realFetch = globalThis.fetch;
  const paystackCalls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://api.paystack.co")) return realFetch(url, options);
    paystackCalls.push({ url: String(url), body: options?.body ? JSON.parse(options.body) : null });
    const body = String(url).includes("/transaction/initialize")
      ? { status: true, data: { authorization_url: "https://checkout.paystack.test/x" } }
      : { status: true, data: { status: "abandoned", reference: String(url).split("/").pop(), amount: 0, currency: "GHS" } };
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/agents", agentRoutes);
  app.use("/api/properties", propertyRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const as = (user) => (method, path, body) => realFetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": "agent", Cookie: `agent_token=${jwt.sign({ id: String(user._id), role: "agent", session: "agent" }, process.env.JWT_KEY, { expiresIn: "1h" })}` }, body: body && JSON.stringify(body) });
  const quote = (user, forPlan, extra = {}) => as(user)("POST", "/subscriptions/quote", { planId: String(forPlan._id), ...extra });

  await t.test("only company accounts can buy company plans, and companies only company plans", async () => {
    assert.equal((await quote(individual, companyPlan)).status, 403, "individual sends a company plan id");
    assert.equal((await quote(agency, companyPlan)).status, 403, "agency sends a company plan id");
    assert.equal((await quote(company, individualPlan)).status, 403, "company sends an individual plan id");
    assert.equal((await quote(company, agencyPlan)).status, 403, "company sends an agency plan id");
    const initialize = await as(individual)("POST", "/subscriptions/initialize", { planId: String(companyPlan._id) });
    assert.equal(initialize.status, 403);
    assert.equal(created.length, 0, "no subscription record is created");
  });

  await t.test("the price comes from the plan, whatever the browser sends", async () => {
    const response = await quote(expiredCompany, companyPlan, { price: 10, amount: 10, accountType: "individual" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.amount, 2000);
    const init = await as(expiredCompany)("POST", "/subscriptions/initialize", { planId: String(companyPlan._id), price: 10, amount: 10 });
    assert.equal(init.status, 200);
    const charge = paystackCalls.find((call) => call.url.includes("/transaction/initialize"));
    assert.equal(charge.body.amount, 200000, "Paystack is asked for ₵2,000 in pesewas");
    assert.equal(created.at(-1).amount, 2000);
    assert.equal(created.at(-1).status, "pending");
  });

  await t.test("a faked payment success doesn't activate anything", async () => {
    const pending = created.at(-1);
    t.mock.method(Subscription, "findOne", () => q(pending));
    t.mock.method(pending, "save", async () => pending);
    const response = await as(expiredCompany)("POST", "/subscriptions/verify", { reference: pending.paymentReference });
    assert.equal(response.status, 402);
    assert.equal(pending.status, "pending");
    assert.equal(pending.paymentStatus, "failed", "recorded as failed, as Paystack reported");
    assert.notEqual(String(expiredCompany.subscription), String(pending._id));
  });

  await t.test("team members without billing rights can't buy or change the plan", async () => {
    assert.equal((await quote(manager, companyPlan)).status, 403);
    assert.equal((await as(manager)("POST", "/subscriptions/initialize", { planId: String(companyPlan._id) })).status, 403);
  });

  await t.test("an expired company can't add listings", async () => {
    assert.equal((await as(expiredCompany)("POST", "/properties", { title: "Office block", status: "draft" })).status, 403);
  });

  await t.test("a company at its listing limit can't submit more listings", async () => {
    listingCount = 2;
    const response = await as(company)("POST", "/properties", { title: "Office block", status: "submit" });
    assert.equal(response.status, 403);
    assert.match((await response.json()).message, /allows up to 2/);
    listingCount = 0;
  });

  await t.test("a company at its team limit can't invite anyone else", async () => {
    const response = await as(company)("POST", "/agents/team/invites", { role: "agent" });
    assert.equal(response.status, 403, "one seat, already used by the manager");
  });

  await t.test("staff can't move work to another organisation by sending its id", async () => {
    const other = new mongoose.Types.ObjectId();
    const response = await as(manager)("POST", "/properties", { title: "Staff draft", status: "draft", owner: String(other), organizationId: String(other), agency: { owner: String(other) } });
    assert.equal(response.status, 201);
    const saved = properties.at(-1);
    assert.equal(String(saved.owner), String(company._id), "listings always belong to the member's own company");
    assert.equal(String(saved.assignedTo), String(manager._id));
  });
});
