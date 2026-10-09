import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import Setting from "../models/Setting.js";
import Notification from "../models/Notification.js";
import authRoutes from "../routes/authRoutes.js";
import agentRoutes from "../routes/agentRoutes.js";
import adminRoutes from "../routes/adminRoutes.js";
import subscriptionRoutes from "../routes/subscriptionRoutes.js";
import { protectOwner } from "../middleware/authMiddleware.js";
import { activateSubscription } from "../controllers/subscriptionController.js";
import { approvedAgent, validateAgentProfile } from "../utils/agentApplication.js";
import { canAccessAgent, agentDestination, sessionDestination } from "../../frontend/src/utils/sessionDomain.js";

test("agent permission and return navigation fail closed", () => {
  for (const status of [undefined, "incomplete", "pending", "rejected", "suspended"]) {
    const user = { role: "agent", isActive: true, status: "active", agentApplication: { status } };
    assert.equal(approvedAgent(user), false);
    assert.equal(canAccessAgent(user), false);
    assert.notEqual(agentDestination(user, "/agent/dashboard"), "/agent/dashboard");
  }
  assert.equal(approvedAgent({ role: "user", isActive: true, agentApplication: { status: "approved" } }), false);
  assert.equal(canAccessAgent({ role: "agent", status: "suspended", agentApplication: { status: "approved" } }), false);
  for (const from of ["//evil.test", "/\\evil.test", "/agent/login", "/login?account=agent", "/agent/../admin/dashboard"]) assert.equal(sessionDestination("agent", from), "/agent/dashboard");
});

test("agent registration, onboarding, payment and admin review use real HTTP guards", async (t) => {
  process.env.JWT_KEY = "agent-application-regression-key";
  const users = [];
  const subscriptions = [];
  let requireSubscription = true;
  const originals = [];
  const replace = (model, method, fn) => { originals.push([model, method, model[method]]); model[method] = fn; };
  const id = (value) => String(value?._id || value);
  const query = (value) => ({ then: (yes, no) => Promise.resolve(value).then(yes, no), catch: (no) => Promise.resolve(value).catch(no), select: () => query(value), populate: () => query(value), sort: () => query(value), lean: () => Promise.resolve(value) });
  const matches = (user, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((choice) => matches(user, choice));
    const current = key.split(".").reduce((object, part) => object?.[part], user);
    if (value?.$in) return value.$in.includes(current);
    if (value && Object.hasOwn(value, "$exists")) return (current !== undefined) === value.$exists;
    return typeof current === "boolean" ? current === value : id(current) === id(value);
  });
  const create = async (data) => {
    const user = new User(data);
    await User.schema.s.hooks.execPre("save", user, []);
    user.unmarkModified("password");
    user.save = async () => { await user.validate(); return user; };
    users.push(user);
    return user;
  };
  const customer = await create({ firstName: "Customer", lastName: "Test", email: "customer@example.test", password: "password123", role: "user" });
  const admin = await create({ firstName: "Admin", lastName: "Test", email: "admin@example.test", password: "password123", role: "admin" });
  const plan = new Plan({ name: "Test plan", price: 100, duration: 30, propertyLimit: 10, imageLimit: 10 });
  replace(User, "exists", async (filter) => users.some((user) => matches(user, filter)));
  replace(User, "create", create);
  replace(User, "findById", (value) => query(users.find((user) => id(user) === id(value)) || null));
  replace(User, "findOne", (filter) => query(users.find((user) => matches(user, filter)) || null));
  replace(User, "find", (filter = {}) => query(users.filter((user) => matches(user, filter))));
  replace(User, "findOneAndUpdate", (filter, update) => {
    const user = users.find((entry) => matches(entry, filter));
    if (user) for (const [path, value] of Object.entries(update.$set)) user.set(path, value);
    return query(user || null);
  });
  replace(Subscription, "findById", (value) => query(subscriptions.find((subscription) => id(subscription) === id(value)) || null));
  replace(Subscription, "findOne", (filter) => query(subscriptions.find((subscription) => matches(subscription, filter)) || null));
  replace(Plan, "findById", () => query(plan));
  replace(Plan, "findOne", () => query(plan));
  replace(Setting, "findOneAndUpdate", () => query({ agent: { requireSubscription }, notifications: {} }));
  replace(Notification, "create", async () => ({}));
  replace(Property, "find", () => query([]));
  replace(Property, "aggregate", async () => []);
  replace(Property, "countDocuments", async () => 0);
  replace(Inquiry, "find", () => query([]));
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/auth", authRoutes);
  app.use("/api/agents", agentRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);
  app.get("/owner", protectOwner, (_req, res) => res.sendStatus(204));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = {};
  const call = async (path, domain = "agent", body, method = body ? "POST" : "GET") => {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": domain, Cookie: Object.entries(jar).map(([name, token]) => `${name}=${token}`).join("; ") }, ...(body ? { body: JSON.stringify(body) } : {}) });
    for (const cookie of response.headers.getSetCookie()) { const [name, token] = cookie.split(";")[0].split("="); jar[name] = token; }
    return response;
  };
  const signup = { fullName: "Akua Mensah", email: "agent@example.test", phone: "+233 24 123 4567", password: "password123", confirmPassword: "password123" };
  const profile = { firstName: "Akua", lastName: "Mensah", phone: signup.phone, agentType: "individual", region: "Greater Accra", city: "East Legon", yearsExperience: 4, bio: "Helping buyers and renters find their next home." };
  let agent;
  try {
    await call("/api/auth/admin/login", "admin", { email: admin.email, password: "password123" });
    await call("/api/auth/customer/login", "customer", { email: customer.email, password: "password123" });
    await t.test("registration hashes passwords, isolates cookies and ignores forged privileges", async () => {
      const response = await call("/api/auth/agent/register", "agent", { ...signup, role: "admin", isActive: false, agentId: id(admin), approvalStatus: "approved", agentApplication: { status: "approved", approvedBy: id(admin) } });
      assert.equal(response.status, 201);
      assert.equal(response.headers.getSetCookie().length, 1);
      assert.match(response.headers.getSetCookie()[0], /^agent_token=.*HttpOnly/);
      const body = (await response.json()).data;
      agent = users.find((user) => user.email === signup.email);
      assert.equal(body.role, "agent"); assert.equal(body.agentApplication.status, "incomplete");
      assert.equal(body.password, undefined); assert.notEqual(agent.password, signup.password);
      assert.equal(await agent.matchPassword(signup.password), true);
      assert.equal(agent.isActive, true); assert.equal(agent.agentApplication.approvedBy, null);
      assert.equal((await call("/api/agents/dashboard")).status, 403);
      assert.equal((await call("/owner")).status, 403);
      assert.equal((await call("/api/agents/profile", "agent", profile, "PUT")).status, 403);
      assert.equal((await call("/api/auth/agent/me")).status, 200);
      assert.equal((await call("/api/agents/application")).status, 200);
    });
    await t.test("basic field validation and normalized duplicate emails", async () => {
      for (const change of [{ fullName: "" }, { email: "invalid" }, { phone: "letters" }, { password: "short", confirmPassword: "short" }, { confirmPassword: "different" }, { password: "😀".repeat(20), confirmPassword: "😀".repeat(20) }]) assert.equal((await call("/api/auth/agent/register", "agent", { ...signup, ...change })).status, 400);
      assert.equal((await call("/api/auth/agent/register", "agent", { ...signup, email: " AGENT@EXAMPLE.TEST " })).status, 409);
      assert.equal((await call("/api/subscriptions/initialize", "agent", { planId: id(plan) })).status, 400);
      assert.equal((await call("/api/subscriptions/initialize", "customer", { planId: id(plan) })).status, 403);
      assert.equal(customer.role, "user");
    });
    await t.test("profile saves only permitted fields; agency fields are conditional", async () => {
      assert.throws(() => validateAgentProfile({ ...profile, agentType: "agency" }), /company name/);
      for (const change of [{ yearsExperience: -1 }, { yearsExperience: 1.5 }, { region: "" }, { bio: "" }]) assert.equal((await call("/api/agents/application", "agent", { ...profile, ...change }, "PUT")).status, 400);
      assert.equal((await call("/api/agents/application", "agent", { ...profile, companyName: "Ignored for individual", role: "admin", isActive: false, agentApplication: { status: "approved" }, status: "approved", approvedAt: new Date() }, "PUT")).status, 200);
      assert.equal(agent.role, "agent"); assert.equal(agent.isActive, true);
      assert.equal(agent.agentApplication.status, "incomplete"); assert.equal(agent.agentApplication.companyName, "");
      assert.ok(agent.agentApplication.profileCompletedAt);
      assert.equal((await call("/api/agents/application/submit", "agent", {})).status, 400);
    });
    await t.test("server payment activation submits for review without approving or changing customer roles", async () => {
      const subscription = new Subscription({ user: agent._id, plan: plan._id, planName: plan.name, amount: 100, paymentReference: "TEST-PAID" });
      subscription.save = async () => subscription;
      subscriptions.push(subscription);
      await activateSubscription(subscription);
      assert.equal(subscription.paymentStatus, "paid"); assert.equal(agent.role, "agent");
      assert.equal(agent.agentApplication.status, "pending"); assert.equal(agent.agentApplication.approvedAt, null);
      assert.equal((await call("/api/subscriptions/verify", "agent", { reference: "TEST-PAID" })).status, 200);
      assert.equal(agent.agentApplication.status, "pending");
      assert.equal((await call("/api/agents/dashboard")).status, 403);
      assert.equal((await call("/api/agents/application", "agent", profile, "PUT")).status, 409);
      assert.equal((await call("/api/subscriptions/verify", "agent", { reference: "unknown" })).status, 404);
      const forged = new Subscription({ user: customer._id, plan: plan._id, planName: plan.name, amount: 100, paymentReference: "CUSTOMER" });
      await assert.rejects(activateSubscription(forged), /agent account/);
      assert.equal(customer.role, "user");
    });
    await t.test("only admin review unlocks the workspace; requirements and audit fields are enforced", async () => {
      const path = `/api/admin/agent-applications/${id(agent)}`;
      for (const domain of ["agent", "customer"]) assert.equal((await call(path, domain, { action: "approve" }, "PATCH")).status, 403);
      subscriptions[0].paymentStatus = "pending";
      assert.equal((await call(path, "admin", { action: "approve" }, "PATCH")).status, 400);
      subscriptions[0].paymentStatus = "paid";
      assert.equal((await call(path, "admin", { action: "approve", approvedBy: id(customer) }, "PATCH")).status, 200);
      assert.equal(agent.agentApplication.status, "approved"); assert.ok(agent.agentApplication.approvedAt);
      assert.equal(id(agent.agentApplication.approvedBy), id(admin));
      assert.equal(id(agent.subscription), id(subscriptions[0]));
      assert.equal((await call("/api/agents/dashboard")).status, 200);
      assert.equal((await call("/api/agents/dashboard", "customer")).status, 403);
      assert.equal((await call(path, "admin", { action: "approve" }, "PATCH")).status, 409);
      assert.equal((await call(`/api/admin/users/${id(agent)}/status`, "admin", { status: "active" }, "PATCH")).status, 400);
    });
    await t.test("approved agents edit public profile fields without changing permissions or approval", async () => {
      const approvedAt = agent.agentApplication.approvedAt.getTime();
      const subscriptionId = id(agent.subscription);
      const body = { ...profile, bio: "Updated professional introduction.", role: "admin", isActive: false, agentApplication: { status: "suspended", approvedBy: id(customer) }, approvedAt: null, agentId: id(admin), profileImage: "" };
      for (const domain of ["customer", "admin"]) assert.equal((await call("/api/agents/profile", domain, body, "PUT")).status, 403);
      assert.equal((await call("/api/agents/profile", "agent", body, "PUT")).status, 200);
      assert.equal(agent.agentApplication.bio, body.bio);
      assert.equal(agent.role, "agent"); assert.equal(agent.isActive, true);
      assert.equal(agent.agentApplication.status, "approved");
      assert.equal(agent.agentApplication.approvedAt.getTime(), approvedAt);
      assert.equal(id(agent.agentApplication.approvedBy), id(admin));
      assert.equal(id(agent.subscription), subscriptionId);
      // The account type is fixed after approval (it changes only through a paid agency plan): the request is ignored
      const typeBefore = agent.agentApplication.agentType;
      assert.equal((await call("/api/agents/profile", "agent", { ...profile, bio: body.bio, agentType: typeBefore === "agency" ? "individual" : "agency" }, "PUT")).status, 200);
      assert.equal(agent.agentApplication.agentType, typeBefore);
      // The fixture does not populate subscription refs; exercise public field selection with subscriptions waived.
      requireSubscription = false;
      let directory;
      try { directory = await (await call("/api/agents/public")).json(); } finally { requireSubscription = true; }
      const publicProfile = directory.data.find((entry) => entry.id === id(agent));
      assert.equal(publicProfile.bio, body.bio);
      for (const key of ["password", "agentApplication", "approvedBy", "subscription", "officeAddress", "ghanaPostGPS"]) assert.equal(publicProfile[key], undefined);
    });
    await t.test("suspension revokes old-token access but preserves status login; reactivation is admin-only", async () => {
      const path = `/api/admin/agent-applications/${id(agent)}`;
      assert.equal((await call(path, "admin", { action: "suspend" }, "PATCH")).status, 200);
      assert.equal((await call("/api/agents/dashboard")).status, 403);
      assert.equal((await call("/api/agents/profile", "agent", profile, "PUT")).status, 403);
      assert.equal((await call("/api/auth/agent/login", "agent", { email: signup.email, password: signup.password })).status, 200);
      assert.equal((await call("/api/auth/agent/me")).status, 200);
      assert.equal((await call("/api/agents/application")).status, 200);
      assert.equal((await call("/api/agents/application", "agent", profile, "PUT")).status, 409);
      assert.equal((await call("/api/subscriptions/initialize", "agent", { planId: id(plan) })).status, 403);
      assert.equal((await call(path, "admin", { action: "reactivate" }, "PATCH")).status, 200);
      assert.equal((await call("/api/agents/dashboard")).status, 200);
    });
    await t.test("waived subscriptions submit for review, and rejected agents can correct and resubmit", async () => {
      requireSubscription = false;
      await call("/api/auth/agent/register", "agent", { ...signup, email: "second@example.test" });
      const second = users.find((user) => user.email === "second@example.test");
      await call("/api/agents/application", "agent", profile, "PUT");
      assert.equal((await call("/api/agents/application/submit", "agent", {})).status, 200);
      const path = `/api/admin/agent-applications/${id(second)}`;
      assert.equal((await call(path, "admin", { action: "reject", rejectionReason: "Please clarify your service area." }, "PATCH")).status, 200);
      assert.equal(second.agentApplication.rejectionReason, "Please clarify your service area.");
      assert.equal((await call("/api/auth/agent/login", "agent", { email: second.email, password: signup.password })).status, 200);
      assert.equal((await call("/api/agents/dashboard")).status, 403);
      assert.equal((await call("/api/agents/application", "agent", { ...profile, city: "Accra" }, "PUT")).status, 200);
      assert.equal((await call("/api/agents/application/submit", "agent", {})).status, 200);
      assert.equal(second.agentApplication.status, "pending");
      assert.equal(second.agentApplication.approvedBy, null);
    });
    await t.test("restoring a legacy suspended identity resumes onboarding without approval", async () => {
      const legacy = await User.create({ firstName: "Legacy", lastName: "Agent", email: "legacy@example.test", password: signup.password, role: "agent", isActive: false });
      const path = `/api/admin/agent-applications/${id(legacy)}`;
      assert.equal((await call(path, "admin", { action: "reactivate" }, "PATCH")).status, 200);
      assert.equal(legacy.isActive, true);
      assert.equal(legacy.agentApplication.status, "incomplete");
      assert.equal((await call("/api/auth/agent/login", "agent", { email: legacy.email, password: signup.password })).status, 200);
      assert.equal((await call("/api/agents/dashboard")).status, 403);
      assert.equal((await call("/api/agents/application", "agent", profile, "PUT")).status, 200);
    });
    await t.test("customer registration remains customer-only even with forged agent fields", async () => {
      const response = await call("/api/auth/customer/register", "customer", { firstName: "New", lastName: "Customer", email: "new-customer@example.test", password: "password123", role: "agent", isActive: false, agentApplication: { status: "approved" } });
      assert.equal(response.status, 201);
      const account = (await response.json()).data;
      assert.equal(account.role, "user"); assert.equal(account.isActive, true);
      assert.equal(account.agentApplication, undefined);
      assert.equal(response.headers.getSetCookie().length, 1);
      assert.match(response.headers.getSetCookie()[0], /^customer_token=/);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [model, method, original] of originals.reverse()) model[method] = original;
  }
});
