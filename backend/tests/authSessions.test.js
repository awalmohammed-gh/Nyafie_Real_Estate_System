import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Setting from "../models/Setting.js";
import Subscription from "../models/Subscription.js";
import authRoutes from "../routes/authRoutes.js";
import adminRoutes from "../routes/adminRoutes.js";
import agentRoutes from "../routes/agentRoutes.js";
import userRoutes from "../routes/userRoutes.js";
import { protect, protectCustomer, protectOwner } from "../middleware/authMiddleware.js";
import { SESSION_ROLES, setAuthCookie } from "../utils/generateToken.js";
import { TEST_CUSTOMER_TAB, customerTabHeaders } from "./support/customerTab.js";
import { agentDestination, authRedirectDestination, sessionDomainForPath, sessionDestination } from "../../frontend/src/utils/sessionDomain.js";

test("frontend destinations keep public pages and private areas in their own domain", () => {
  for (const path of ["/", "/login", "/account/profile", "/agent/123", "/agent/plans"]) assert.equal(sessionDomainForPath(path), "customer");
  for (const path of ["/agent", "/agent/login", "/agent/register", "/agent/onboarding", "/agent/status", "/agent/checkout", "/agent/dashboard", "/agent/profile", "/agent/subscription/checkout"]) assert.equal(sessionDomainForPath(path), "agent");
  assert.equal(sessionDomainForPath("/login", "?account=agent"), "agent");
  assert.equal(sessionDomainForPath("/register", "?account=agent"), "agent");
  // /admin is an ordinary public page (not found); the console lives at its private address (adminEntry.test.js)
  assert.equal(sessionDomainForPath("/admin/dashboard"), "customer");
  assert.equal(sessionDestination("agent", "//example.com"), "/agent/dashboard");
});

test("explicit account switching keeps both auth forms open with an existing role session", () => {
  const user = { role: "agent", status: "active", agentApplication: { status: "approved" } };
  for (const pathname of ["/login", "/register"]) {
    const domain = sessionDomainForPath(pathname, "?account=agent");
    assert.equal(authRedirectDestination({ isAuthenticated: true, explicitSignIn: true, domain, user }), null);
    assert.equal(authRedirectDestination({ isAuthenticated: true, domain, user }), "/agent/dashboard");
  }
  assert.equal(authRedirectDestination({ isAuthenticated: true, explicitSignIn: true, domain: "customer" }), null);
  assert.equal(authRedirectDestination({ isAuthenticated: false, domain: "agent", user }), null);
  // Successful credential submission still uses the regular dashboard/onboarding destination.
  assert.equal(agentDestination(user, "/agent/messages"), "/agent/messages");
  assert.equal(agentDestination({ role: "agent", onboarding: { nextPath: "/agent/onboarding/profile" } }), "/agent/onboarding/profile");
});

// Exercise real HTTP routing, controllers, JWT signing and middleware without
// touching the development database or resetting existing account passwords.
test("role session isolation", async (t) => {
  process.env.JWT_KEY = "isolated-auth-regression-test-key";
  const accounts = Object.entries(SESSION_ROLES).map(([session, role], index) => ({
    emailVerifiedAt: new Date(), _id: String(index + 1).padStart(24, "0"), role, isActive: true,
    ...(role === "agent" ? { agentApplication: { status: "approved", profileCompletedAt: new Date(), approvedAt: new Date() } } : {}),
    email: `${session}@example.test`, firstName: session, lastName: "Test",
    matchPassword: async (password) => password === "TestPassword123",
    toJSON() { return { ...this }; },
  }));
  const originalFind = User.findById;
  const originalFindOne = User.findOne;
  const originalSettings = Setting.findOneAndUpdate;
  const originalSubscription = Subscription.findOne;
  const query = (value) => ({ then: (resolve, reject) => Promise.resolve(value).then(resolve, reject), populate: () => query(value), select: () => query(value) });
  Setting.findOneAndUpdate = () => ({ lean: async () => ({ agent: { requireSubscription: false } }) });
  Subscription.findOne = () => ({ sort: () => query(null) });
  User.findById = (id) => query(accounts.find((account) => account._id === String(id)) || null);
  User.findOne = ({ email }) => query(accounts.find((account) => account.email === email) || null);
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/agents", agentRoutes);
  app.use("/api/users", userRoutes);
  app.get("/shared", protect, (req, res) => res.json({ id: req.user._id, role: req.user.role }));
  app.get("/customer", protect, protectCustomer, (_req, res) => res.sendStatus(204));
  app.get("/owner", protect, protectOwner, (_req, res) => res.sendStatus(204));
  app.use((error, _req, res, _next) => res.status(503).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookies = {};
  const call = (path, { domain, jar = cookies, data, method = data ? "POST" : "GET" } = {}) => fetch(base + path, {
    method, headers: {
      ...customerTabHeaders(domain),
      "Content-Type": "application/json", Cookie: Object.entries(jar).map(([name, value]) => `${name}=${value}`).join("; "),
      ...(domain ? { "X-Session-Domain": domain } : {}),
    }, ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const signIn = async (session) => {
    const response = await call(`/api/auth/${session}/login`, { domain: session, data: { email: `${session}@example.test`, password: "TestPassword123" } });
    assert.equal(response.status, 200);
    const headers = response.headers.getSetCookie();
    assert.equal(headers.length, 1);
    assert.match(headers[0], new RegExp(`^${session}_token=`));
    assert.match(headers[0], /HttpOnly/);
    assert.match(headers[0], /Path=\//);
    const [name, token] = headers[0].split(";")[0].split("=");
    cookies[name] = token;
    const payload = jwt.verify(token, process.env.JWT_KEY);
    assert.equal(payload.role, SESSION_ROLES[session]);
    assert.equal(payload.session, session);
    const body = await response.json();
    assert.equal(body.data.role, SESSION_ROLES[session]);
    assert.equal(body.data.password, undefined);
    assert.equal(body.data.token, undefined);
  };
  try {
    await t.test("each login sets its own HTTP-only cookie; customers use session-only cookies", async () => {
      for (const session of ["admin", "agent", "customer"]) await signIn(session);
      assert.equal(Object.keys(cookies).length, 3);
    });
    await t.test("each /me restores the correct identity with every cookie present", async () => {
      for (const session of Object.keys(SESSION_ROLES)) {
        const response = await call(`/api/auth/${session}/me`, { domain: session });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).data.role, SESSION_ROLES[session]);
      }
    });
    for (const session of Object.keys(SESSION_ROLES)) {
      await t.test(`${session} logout leaves both other sessions authenticated`, async () => {
        const response = await call(`/api/auth/${session}/logout`, { domain: session, method: "POST" });
        assert.equal(response.status, 200);
        assert.equal(response.headers.getSetCookie().length, 1);
        assert.match(response.headers.getSetCookie()[0], new RegExp(`^${session}_token=;`));
        delete cookies[`${session}_token`];
        for (const other of Object.keys(SESSION_ROLES)) {
          const check = await call(`/api/auth/${other}/me`, { domain: other });
          assert.equal(check.status, session === other ? 401 : 200);
        }
        await signIn(session);
      });
    }
    await t.test("no fallback to another cookie or the legacy token", async () => {
      for (const session of Object.keys(SESSION_ROLES)) {
        const jar = { ...cookies, token: cookies[`${session}_token`] };
        delete jar[`${session}_token`];
        const response = await call(`/api/auth/${session}/me`, { domain: session, jar });
        assert.equal(response.status, 401);
        assert.equal(response.headers.getSetCookie().length, 0);
      }
    });
    await t.test("valid JWTs copied into every other role cookie are rejected", async () => {
      for (const target of Object.keys(SESSION_ROLES)) for (const source of Object.keys(SESSION_ROLES)) {
        if (source === target) continue;
        const response = await call(`/api/auth/${target}/me`, { domain: target, jar: { ...cookies, [`${target}_token`]: cookies[`${source}_token`] } });
        assert.equal(response.status, 401);
        assert.equal(response.headers.getSetCookie().length, 1);
        assert.match(response.headers.getSetCookie()[0], new RegExp(`^${target}_token=`));
      }
    });
    await t.test("missing/mismatched claims, expired and tampered JWTs are rejected", async () => {
      for (const session of Object.keys(SESSION_ROLES)) {
        const id = accounts.find((account) => account.role === SESSION_ROLES[session])._id;
        for (const token of [
          jwt.sign({ id }, process.env.JWT_KEY),
          jwt.sign({ id, session, role: "wrong" }, process.env.JWT_KEY),
          jwt.sign({ id, session, role: SESSION_ROLES[session] }, process.env.JWT_KEY, { expiresIn: -1 }),
          `${cookies[`${session}_token`]}tampered`,
        ]) assert.equal((await call(`/api/auth/${session}/me`, { domain: session, jar: { [`${session}_token`]: token } })).status, 401);
      }
    });
    await t.test("role-only APIs reject customer/agent access even with all cookies present", async () => {
      for (const [path, domain] of [["/api/admin/users", "customer"], ["/api/admin/users", "agent"], ["/api/agents/dashboard", "customer"], ["/api/users/saved", "agent"], ["/api/users/saved", "admin"]])
        assert.equal((await call(path, { domain })).status, 403);
      // Without a selector these default to the route's own session. Admin routes then also lack the
      // console's private address, so they answer like unknown endpoints instead of asking for a login.
      for (const [path, jar, status] of [["/api/admin/users", { customer_token: cookies.customer_token }, 404], ["/api/admin/users", { agent_token: cookies.agent_token }, 404], ["/api/agents/dashboard", { customer_token: cookies.customer_token }, 401]])
        assert.equal((await call(path, { jar })).status, status);
    });
    await t.test("shared endpoints select exactly one role and retain it through subsequent guards", async () => {
      for (const session of Object.keys(SESSION_ROLES)) {
        const response = await call("/shared", { domain: session });
        assert.equal((await response.json()).role, SESSION_ROLES[session]);
      }
      assert.equal((await call("/shared", { domain: "unknown" })).status, 403);
      assert.equal((await call("/owner")).status, 403); // no silent switch from customer to agent
      assert.equal((await call("/customer", { domain: "agent" })).status, 403);
      assert.equal((await call("/owner", { domain: "agent" })).status, 204);
    });
    await t.test("login never accepts credentials from another role", async () => {
      for (const target of Object.keys(SESSION_ROLES)) for (const source of Object.keys(SESSION_ROLES)) {
        if (target === source) continue;
        const response = await call(`/api/auth/${target}/login`, { domain: target, data: { email: `${source}@example.test`, password: "TestPassword123" } });
        assert.equal(response.status, 401);
        assert.equal(response.headers.getSetCookie().length, 0);
      }
    });
    await t.test("role login/logout routes reject a conflicting session selector", async () => {
      for (const [path, domain] of [["/api/auth/admin/logout", "customer"], ["/api/auth/agent/logout", "customer"], ["/api/auth/customer/logout", "agent"], ["/api/auth/admin/login", "agent"], ["/api/auth/logout", "admin"]]) {
        const response = await call(path, { domain, method: "POST" });
        assert.equal(response.status, 403);
        assert.equal(response.headers.getSetCookie().length, 0);
      }
    });
    await t.test("account role changes and suspension invalidate previously issued tokens", async () => {
      const account = accounts[0];
      account.isActive = false;
      assert.equal((await call("/api/auth/customer/me", { domain: "customer" })).status, 401);
      account.isActive = true;
      account.role = "agent";
      assert.equal((await call("/api/auth/customer/me", { domain: "customer" })).status, 401);
      account.role = "user";
    });
    await t.test("database errors propagate without clearing a valid cookie", async () => {
      User.findById = () => { throw new Error("Database unavailable"); };
      const response = await call("/api/auth/customer/me", { domain: "customer" });
      assert.equal(response.status, 503);
      assert.equal(response.headers.getSetCookie().length, 0);
    });
    await t.test("production cookies stay secure and same-site by default", () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        for (const session of Object.keys(SESSION_ROLES)) setAuthCookie({ cookie: (name, _token, options) => {
          assert.equal(name, `${session}_token`);
          assert.equal(options.httpOnly, true);
          assert.equal(options.secure, true);
          assert.equal(options.sameSite, "lax");
          assert.equal(options.maxAge, session === "customer" ? undefined : session === "admin" ? 43200000 : 604800000);
        } }, accounts[0]._id, session, "", TEST_CUSTOMER_TAB);
      } finally {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
      }
    });
  } finally {
    User.findById = originalFind;
    User.findOne = originalFindOne;
    Setting.findOneAndUpdate = originalSettings;
    Subscription.findOne = originalSubscription;
    await new Promise((resolve) => server.close(resolve));
  }
});
