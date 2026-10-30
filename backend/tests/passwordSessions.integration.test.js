import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Setting from "../models/Setting.js";
import Subscription from "../models/Subscription.js";
import authRoutes from "../routes/authRoutes.js";
import subscriptionRoutes from "../routes/subscriptionRoutes.js";
import { optionalAuth, viewerSessions } from "../middleware/authMiddleware.js";
import { SESSION_ROLES } from "../utils/generateToken.js";
import { customerTabHeaders } from "./support/customerTab.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("password changes revoke older sessions while renewing only the requesting browser", { skip: process.env.RUN_AUTH_INTEGRATION !== "1", timeout: 90000 }, async (t) => {
  await isolatedMongo(t);
  const previousKey = process.env.JWT_KEY;
  process.env.JWT_KEY = "isolated-password-session-test-signing-key";
  t.after(() => { if (previousKey === undefined) delete process.env.JWT_KEY; else process.env.JWT_KEY = previousKey; });
  await Setting.create({ key: "platform", agent: { requireSubscription: false } });
  const accounts = {};
  for (const [session, role] of Object.entries(SESSION_ROLES)) {
    accounts[session] = await User.create({ firstName: "Session", lastName: session, email: `${session}@sessions.test`, password: "OriginalPassword123", role, ...(role === "agent" ? { agentApplication: { status: "approved" } } : {}) });
  }
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/auth", authRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);
  app.get("/optional", optionalAuth, (req, res) => res.json({ authenticated: Boolean(req.user) }));
  app.get("/viewers", viewerSessions, (req, res) => res.json(Object.fromEntries(Object.entries(req.viewerSessions).map(([session, user]) => [session, Boolean(user)]))));
  app.use((_error, _req, res, _next) => res.status(500).json({ success: false }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(done => server.once("listening", done));
  t.after(() => new Promise(done => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (session, path, { method = "GET", cookie, body } = {}) => fetch(base + path, {
    method,
    headers: { ...customerTabHeaders(session), "X-Session-Domain": session, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const cookieFrom = response => response.headers.getSetCookie()[0]?.split(";")[0];
  const login = async (session, password = "OriginalPassword123") => {
    const response = await request(session, `/api/auth/${session}/login`, { method: "POST", body: { email: accounts[session].email, password } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.sessionVersion, undefined);
    return cookieFrom(response);
  };

  const currentCookies = {};
  for (const session of Object.keys(SESSION_ROLES)) currentCookies[session] = await login(session);
  for (const session of Object.keys(SESSION_ROLES)) {
    await t.test(`${session}: old cookies are revoked, fresh login and the renewed cookie work`, async () => {
      const account = accounts[session];
      const first = await login(session), second = await login(session);
      const legacyToken = jwt.sign({ id: account.id, role: account.role, session }, process.env.JWT_KEY, { expiresIn: "1h" });
      const legacy = `${session}_token=${legacyToken}`;
      const me = cookie => request(session, `/api/auth/${session}/me`, { cookie });
      const change = (cookie, currentPassword, newPassword) => request(session, `/api/auth/${session}/me/password`, { method: "PUT", cookie, body: { currentPassword, newPassword } });
      assert.equal((await me(legacy)).status, session === "customer" ? 401 : 200, "customers must reauthenticate into a tab-bound session; other roles retain legacy compatibility until password change");

      for (const [current, next] of [["WrongPassword123", "NewPassword123"], ["OriginalPassword123", "short"]]) {
        const rejected = await change(first, current, next);
        assert.equal(rejected.status, 400);
        assert.equal(rejected.headers.getSetCookie().length, 0);
        assert.equal((await me(second)).status, 200);
        assert.equal((await User.findById(account.id).select("+sessionVersion")).sessionVersion, "");
      }
      const profile = await request(session, `/api/auth/${session}/me`, { method: "PUT", cookie: first, body: { firstName: "Updated" } });
      assert.equal(profile.status, 200);
      assert.equal((await me(second)).status, 200, "profile edits do not revoke sessions");

      const changed = await change(first, "OriginalPassword123", "NewPassword123");
      assert.equal(changed.status, 200);
      const renewed = cookieFrom(changed);
      assert.ok(renewed?.startsWith(`${session}_token=`));
      const payload = jwt.verify(renewed.slice(renewed.indexOf("=") + 1), process.env.JWT_KEY);
      const stored = await User.findById(account.id).select("+sessionVersion +password");
      assert.match(stored.sessionVersion, /^[a-f\d-]{36}$/);
      assert.equal(payload.sessionVersion, stored.sessionVersion);
      assert.equal(stored.toJSON().sessionVersion, undefined);
      assert.equal(stored.toJSON().password, undefined);
      assert.ok(await stored.matchPassword("NewPassword123"));
      for (const old of [first, second, legacy]) {
        const rejected = await me(old);
        assert.equal(rejected.status, 401);
        assert.match(rejected.headers.getSetCookie()[0], new RegExp(`^${session}_token=;`));
      }
      assert.equal((await me(renewed)).status, 200, "requesting browser receives a working replacement cookie");
      assert.equal((await (await request(session, "/optional", { cookie: second })).json()).authenticated, false);
      assert.equal((await (await request(session, "/viewers", { cookie: second })).json())[session], false);
      const fresh = await login(session, "NewPassword123");
      assert.equal((await me(fresh)).status, 200);
      const oldLogin = await request(session, `/api/auth/${session}/login`, { method: "POST", body: { email: account.email, password: "OriginalPassword123" } });
      assert.equal(oldLogin.status, 401);

      const again = await change(renewed, "NewPassword123", "NewestPassword123");
      assert.equal(again.status, 200);
      const latest = cookieFrom(again);
      assert.notEqual((await User.findById(account.id).select("+sessionVersion")).sessionVersion, payload.sessionVersion);
      assert.equal((await me(renewed)).status, 401);
      assert.equal((await me(fresh)).status, 401);
      assert.equal((await me(latest)).status, 200);
      currentCookies[session] = latest;
      for (const other of Object.keys(SESSION_ROLES).filter(other => other !== session)) {
        assert.equal((await request(other, `/api/auth/${other}/me`, { cookie: currentCookies[other] })).status, 200, "another account's sessions remain valid");
      }
    });
  }

  await t.test("a failed password save does not revoke sessions or issue a replacement cookie", async (subtest) => {
    const cookie = await login("customer", "NewestPassword123");
    const before = await User.findById(accounts.customer.id).select("+sessionVersion +password");
    const save = subtest.mock.method(User.collection, "updateOne", async (_filter, update) => {
      assert.ok(update.$set.password, "the password hash is part of the write");
      assert.ok(update.$set.sessionVersion, "revocation is part of the very same write");
      throw new Error("Simulated write failure");
    });
    const response = await request("customer", "/api/auth/customer/me/password", { method: "PUT", cookie, body: { currentPassword: "NewestPassword123", newPassword: "UncommittedPassword123" } });
    save.mock.restore();
    assert.equal(response.status, 500);
    assert.equal(response.headers.getSetCookie().length, 0);
    const after = await User.findById(accounts.customer.id).select("+sessionVersion +password");
    assert.equal(after.sessionVersion, before.sessionVersion);
    assert.equal(after.password, before.password);
    assert.equal((await request("customer", "/api/auth/customer/me", { cookie })).status, 200);
  });

  await t.test("subscription verification preserves a changed-password agent's current session version", async () => {
    const cookie = await login("agent", "NewestPassword123");
    const subscription = await Subscription.create({ user: accounts.agent.id, plan: accounts.agent.id, planName: "Session test plan", amount: 0, paymentStatus: "paid", paymentReference: "session-test-already-paid" });
    const response = await request("agent", "/api/subscriptions/verify", { method: "POST", cookie, body: { reference: subscription.paymentReference } });
    assert.equal(response.status, 200);
    const renewed = cookieFrom(response);
    const token = jwt.verify(renewed.slice(renewed.indexOf("=") + 1), process.env.JWT_KEY);
    assert.equal(token.sessionVersion, (await User.findById(accounts.agent.id).select("+sessionVersion")).sessionVersion);
    assert.equal((await request("agent", "/api/auth/agent/me", { cookie: renewed })).status, 200);
  });

  await t.test("admin password recovery through the model also revokes existing cookies", async () => {
    const cookie = await login("admin", "NewestPassword123");
    const admin = await User.findById(accounts.admin.id);
    admin.password = "RecoveredPassword123";
    await admin.save();
    assert.equal((await request("admin", "/api/auth/admin/me", { cookie })).status, 401);
    const recovered = await login("admin", "RecoveredPassword123");
    assert.equal((await request("admin", "/api/auth/admin/me", { cookie: recovered })).status, 200);
  });
});
