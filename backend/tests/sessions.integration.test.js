import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import Session from "../models/Session.js";
import Setting from "../models/Setting.js";
import User from "../models/User.js";
import { customerTabHeaders } from "./support/customerTab.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("sessions are stored in MongoDB and ending one takes effect at once", { skip: process.env.RUN_SESSIONS_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  const saved = { JWT_KEY: process.env.JWT_KEY, ADMIN_TWO_STEP: process.env.ADMIN_TWO_STEP };
  Object.assign(process.env, { JWT_KEY: "isolated-stored-sessions-signing-key-32", ADMIN_TWO_STEP: "off" });
  t.after(() => { for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  await isolatedMongo(t);
  await Session.init(); // its indexes
  await Setting.create({ key: "platform", agent: { requireSubscription: false } });
  const password = "OriginalPassword123";
  const person = (name, fields = {}) => User.create({ firstName: name, lastName: "Person", email: `${name.toLowerCase()}@sessions.test`, phone: "0241234567", password, emailVerifiedAt: new Date(), ...fields });
  const ama = await person("Ama"), kofi = await person("Kofi", { role: "agent", agentApplication: { status: "approved", agentType: "individual", profileCompletedAt: new Date(), proofCount: 1 } }), admin = await person("Admin", { role: "admin" });
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (session, path, { cookie = "", body, method = body ? "POST" : "GET", agent = "Mozilla/5.0 (Windows NT 10.0) Chrome/131.0 Safari/537.36" } = {}) => {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", "User-Agent": agent, "X-Session-Domain": session, ...customerTabHeaders(session), Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cookies: response.headers.getSetCookie() };
  };
  const login = async (user, session = "customer", { pass = password, ...options } = {}) => { const done = await call(session, `/auth/${session}/login`, { ...options, body: { email: user.email, password: pass } }); assert.equal(done.status, 200, JSON.stringify(done.body)); return done.cookies[0].split(";")[0]; };
  const me = async (session, cookie) => (await call(session, `/auth/${session}/me`, { cookie })).status;
  const stored = (user) => Session.find({ user: user._id }).sort({ createdAt: 1 }).lean();

  await t.test("signing in stores one session; the database holds no token", async () => {
    const cookie = await login(ama);
    const [record, ...rest] = await stored(ama);
    assert.equal(rest.length, 0);
    assert.deepEqual([record.area, record.device, record.endedAt], ["customer", "Chrome on Windows", null]);
    assert.equal(jwt.decode(cookie.split("=")[1]).sid, String(record._id));
    assert.equal(JSON.stringify(record).includes(cookie.split("=")[1].slice(0, 30)), false);
    assert.equal(Math.round((record.expiresAt - record.createdAt) / 60000), 120);
    const ttl = (await Session.collection.indexes()).find((index) => index.key.expiresAt);
    assert.equal(ttl.expireAfterSeconds, 7 * 24 * 60 * 60, "MongoDB clears old sessions by itself");
    assert.equal(await me("customer", cookie), 200);
  });

  await t.test("signing out really ends it: a copied cookie stops working", async () => {
    const cookie = await login(kofi, "agent");
    assert.equal(await me("agent", cookie), 200);
    await call("agent", "/auth/agent/logout", { cookie, method: "POST" });
    assert.equal(await me("agent", cookie), 401);
    assert.equal((await stored(kofi)).at(-1).endReason, "signed_out");
  });

  await t.test("an expired, deleted or someone else's session opens nothing, whatever the token says", async () => {
    const cookie = await login(kofi, "agent");
    const sid = jwt.decode(cookie.split("=")[1]).sid;
    await Session.updateOne({ _id: sid }, { expiresAt: new Date(Date.now() - 1000) });
    assert.equal(await me("agent", cookie), 401);
    await Session.updateOne({ _id: sid }, { expiresAt: new Date(Date.now() + 3600000), user: ama._id });
    assert.equal(await me("agent", cookie), 401);
    await Session.updateOne({ _id: sid }, { user: kofi._id, area: "customer" });
    assert.equal(await me("agent", cookie), 401);
    await Session.updateOne({ _id: sid }, { area: "agent" });
    assert.equal(await me("agent", cookie), 200);
    await Session.deleteOne({ _id: sid });
    assert.equal(await me("agent", cookie), 401);
    const unstored = "agent_token=" + jwt.sign({ id: kofi.id, role: "agent", session: "agent" }, process.env.JWT_KEY, { expiresIn: "7d" });
    assert.equal(await me("agent", unstored), 401, "tokens from before sessions were stored");
  });

  await t.test("a person sees where they're signed in and ends what they choose, only their own", async () => {
    await Session.deleteMany({});
    const here = await login(kofi, "agent"), phone = await login(kofi, "customer", { agent: "Mozilla/5.0 (iPhone; like Mac OS X) Version/18.0 Safari/604.1" }), laptop = await login(kofi, "agent");
    const theirs = await login(ama);
    const list = async (cookie = here) => (await call("agent", "/auth/agent/sessions", { cookie })).body.data;
    const sessions = await list();
    assert.equal(sessions.length, 3);
    assert.equal(sessions.filter((entry) => entry.current).length, 1);
    assert.ok(sessions.some((entry) => entry.device === "Safari on iPhone" && entry.area === "customer"), "both areas in one list");
    assert.equal(JSON.stringify(sessions).includes("token"), false);
    const end = (id, cookie = here) => call("agent", `/auth/agent/sessions/${id}`, { cookie, method: "DELETE" });
    const amas = String((await stored(ama))[0]._id);
    assert.equal((await end(amas)).status, 404, "someone else's");
    assert.equal(await me("customer", theirs), 200);
    for (const bad of ["nope", "000000000000000000000000"]) assert.equal((await end(bad)).status, 404);
    assert.equal((await end(sessions.find((entry) => entry.current).id)).status, 400, "this device signs out normally");
    assert.equal((await end(sessions.find((entry) => entry.area === "customer").id)).status, 200);
    assert.equal(await me("customer", phone), 401);
    assert.equal(await me("agent", laptop), 200);
    assert.equal((await end("others")).body.data.ended, 1);
    assert.equal(await me("agent", laptop), 401);
    assert.equal(await me("agent", here), 200);
    const all = await end("all");
    assert.deepEqual(all.cookies.map((value) => value.split("=")[0]).sort(), ["agent_token", "customer_token"]);
    assert.equal(await me("agent", here), 401);
    assert.equal((await call("agent", "/auth/agent/sessions", { cookie: here })).status, 401);
  });

  await t.test("changing the password ends every session and continues this one with a new one", async () => {
    await Session.deleteMany({});
    const here = await login(ama), elsewhere = await login(ama);
    const changed = await call("customer", "/auth/customer/me/password", { cookie: here, method: "PUT", body: { currentPassword: password, newPassword: "ANewLongPassword123" } });
    assert.equal(changed.status, 200);
    const next = changed.cookies[0].split(";")[0];
    assert.deepEqual([await me("customer", here), await me("customer", elsewhere), await me("customer", next)], [401, 401, 200]);
    assert.equal(await Session.countDocuments({ user: ama._id, endedAt: null }), 1);
  });

  await t.test("admins end anyone's sessions; suspension, email changes and deletion do too", async () => {
    const amaPass = { pass: "ANewLongPassword123" };
    const adminCookie = await login(admin, "admin");
    const as = (method, path, body) => call("admin", path, { cookie: adminCookie, method, body });
    const customer = await login(ama, "customer", amaPass), agentArea = await login(kofi, "agent");
    const ended = await as("POST", `/admin/users/${kofi.id}/sign-out`);
    assert.equal(ended.status, 200);
    assert.ok(ended.body.data.ended >= 1);
    assert.equal(await me("agent", agentArea), 401);
    assert.equal(await me("customer", customer), 200, "only theirs");
    assert.equal((await as("POST", `/admin/users/${admin.id}/sign-out`)).status, 403);
    assert.notEqual((await call("customer", `/admin/users/${kofi.id}/sign-out`, { cookie: customer, method: "POST" })).status, 200);
    assert.equal((await as("PATCH", `/admin/users/${ama.id}/status`, { status: "suspended" })).status, 200);
    await as("PATCH", `/admin/users/${ama.id}/status`, { status: "active" });
    assert.equal(await me("customer", customer), 401, "an old session doesn't come back with the account");
    const again = await login(ama, "customer", amaPass);
    assert.equal((await as("PUT", `/admin/users/${ama.id}`, { email: "ama.new@sessions.test" })).status, 200);
    assert.equal(await me("customer", again), 401);
    assert.equal((await stored(ama)).at(-1).endReason, "email");
    const suspended = await login(kofi, "agent");
    assert.equal((await as("PATCH", `/admin/agent-applications/${kofi.id}`, { action: "suspend" })).status, 200);
    assert.equal(await me("agent", suspended), 401);
    assert.equal(await me("agent", await login(kofi, "agent")), 200, "they can sign in to read why");
    assert.equal((await as("DELETE", `/admin/users/${ama.id}`)).status, 200);
    assert.equal(await Session.countDocuments({ user: ama._id }), 0, "nothing about a deleted account's sign-ins is kept");
    assert.equal(await me("admin", adminCookie), 200);
  });

  await t.test("last used is saved now and then, and never extends the session", async () => {
    const cookie = await login(admin, "admin");
    const sid = jwt.decode(cookie.split("=")[1]).sid;
    const before = await Session.findById(sid).lean();
    await me("admin", cookie);
    assert.equal(+(await Session.findById(sid)).lastUsedAt, +before.lastUsedAt, "not on every request");
    await Session.updateOne({ _id: sid }, { lastUsedAt: new Date(Date.now() - 600000) });
    await me("admin", cookie);
    const after = await Session.findById(sid).lean();
    assert.ok(Date.now() - after.lastUsedAt < 60000);
    assert.equal(+after.expiresAt, +before.expiresAt);
  });
});
