import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import PasswordReset from "../models/PasswordReset.js";
import Setting from "../models/Setting.js";
import { createApp } from "../app.js";
import { passwordResetMailer } from "../utils/email.js";
import { loginAttempts } from "../utils/loginAttempts.js";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("customer password recovery proves mailbox ownership, expires and revokes sessions", {
  skip: process.env.RUN_PASSWORD_RESET_INTEGRATION !== "1", timeout: 90000,
}, async (t) => {
  const previous = { JWT_KEY: process.env.JWT_KEY, SMTP_USER: process.env.SMTP_USER, SMTP_APP_PASSWORD: process.env.SMTP_APP_PASSWORD, NODE_ENV: process.env.NODE_ENV };
  Object.assign(process.env, { JWT_KEY: "password-reset-integration-signing-key", SMTP_USER: "sender@gmail.com", SMTP_APP_PASSWORD: "test-app-password", NODE_ENV: "development" });
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  await isolatedMongo(t);
  await Setting.create({ key: "platform" });
  const deliveries = [];
  let failDelivery = false;
  t.mock.method(passwordResetMailer, "send", async (email, code) => { if (failDelivery) throw new Error("SMTP unavailable"); deliveries.push({ email, code }); });
  t.mock.method(console, "error", () => {});
  const app = createApp({ initialize: async () => {} });
  app.set("trust proxy", 1); // Separate simulated clients still share account-level counters.
  const server = app.listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let client = 1;
  const request = (path, body, cookie) => fetch(base + path, {
    method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "X-Session-Domain": "customer", "X-Forwarded-For": `127.0.0.${client}`, ...customerTabHeaders("customer"), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const person = (email, fields = {}) => User.create({ firstName: "Reset", lastName: "Customer", email, password: "OriginalPassword123", emailVerifiedAt: new Date(), ...fields });
  const forgot = (email) => request("/auth/customer/forgot-password", { email });
  const reset = (email, code, newPassword = "StrongNewPassword123") => request("/auth/customer/reset-password", { email, code, newPassword });
  const user = await person("customer@reset.test");
  let code;

  await t.test("unknown, inactive, admin and removed accounts receive the same public response", async () => {
    const inactive = await person("inactive@reset.test", { isActive: false });
    const admin = await person("admin@reset.test", { role: "admin" });
    const agent = await person("agent@reset.test", { role: "agent", agentApplication: { status: "removed" } });
    const expected = await (await forgot("unknown@reset.test")).json();
    for (const email of [inactive.email, admin.email, agent.email, user.email]) {
      const response = await forgot(email);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), expected);
    }
    assert.equal(deliveries.length, 1);
    code = deliveries[0].code;
    assert.equal((await forgot(user.email)).status, 200);
    assert.equal(deliveries.length, 1, "cooldown must not send a second email");
    assert.equal(await (await User.findById(user.id).select("+password")).matchPassword("OriginalPassword123"), true);
    assert.notEqual((await PasswordReset.findById(user.id).select("+codeHash")).codeHash, code);
    assert.equal((await reset(admin.email, code)).status, 400);
  });

  await t.test("valid code changes the password once, unlocks login and revokes every old customer session", async () => {
    client = 2;
    const oldCookie = "customer_token=" + jwt.sign({ id: user.id, role: "user", session: "customer", ...customerTabClaims("customer") }, process.env.JWT_KEY, { expiresIn: "1h" });
    assert.equal((await request("/auth/customer/me", undefined, oldCookie)).status, 200);
    for (let index = 0; index < 3; index++) await loginAttempts.failure(user.email);
    assert.ok((await loginAttempts.check(user.email)).retryAfter > 0);
    assert.equal((await reset(user.email, code, "short")).status, 400);
    assert.equal((await reset(user.email, "000000")).status, 400);
    const response = await reset(user.email.toUpperCase(), code);
    assert.equal(response.status, 200);
    assert.ok(response.headers.getSetCookie().every((cookie) => !cookie.includes("customer_token=ey")), "recovery must not automatically sign in");
    const changed = await User.findById(user.id).select("+password +sessionVersion");
    assert.equal(await changed.matchPassword("StrongNewPassword123"), true);
    assert.equal(await changed.matchPassword("OriginalPassword123"), false);
    assert.ok(changed.sessionVersion);
    assert.equal((await loginAttempts.check(user.email)).retryAfter, 0);
    assert.equal((await request("/auth/customer/me", undefined, oldCookie)).status, 401);
    assert.equal((await request("/auth/customer/login", { email: user.email, password: "StrongNewPassword123" })).status, 200);
    assert.equal((await reset(user.email, code)).status, 400, "used code cannot be replayed");
  });

  await t.test("expiry, concurrent guesses, resend and hourly quotas apply per account", async () => {
    client = 3;
    const account = await person("expiry@reset.test");
    await forgot(account.email);
    const firstCode = deliveries.at(-1).code;
    await Promise.all(Array.from({ length: 6 }, () => reset(account.email, "000000")));
    assert.equal((await PasswordReset.findById(account.id)).attempts, 5);
    assert.equal((await reset(account.email, firstCode)).status, 400);
    await PasswordReset.updateOne({ _id: account.id }, { nextSendAt: new Date(0) });
    await forgot(account.email);
    const secondCode = deliveries.at(-1).code;
    if (firstCode !== secondCode) assert.equal((await reset(account.email, firstCode)).status, 400);
    await PasswordReset.updateOne({ _id: account.id }, { expiresAt: new Date(0) });
    assert.equal((await reset(account.email, secondCode)).status, 400);
    await PasswordReset.updateOne({ _id: account.id }, { nextSendAt: new Date(0), sendCount: 5 });
    const count = deliveries.length;
    await forgot(account.email);
    assert.equal(deliveries.length, count);
  });

  await t.test("failed delivery leaves no usable code; password changes invalidate outstanding codes", async () => {
    client = 4;
    const account = await person("delivery@reset.test");
    failDelivery = true;
    assert.equal((await forgot(account.email)).status, 200);
    assert.equal((await PasswordReset.findById(account.id).select("+codeHash")).codeHash, undefined);
    failDelivery = false;
    await forgot(account.email);
    const oldCode = deliveries.at(-1).code;
    account.password = "ChangedElsewhere123";
    await account.save();
    assert.equal((await reset(account.email, oldCode)).status, 400);
    assert.equal(await (await User.findById(account.id).select("+password")).matchPassword("ChangedElsewhere123"), true);
  });

  await t.test("parallel correct-code requests succeed once and unverified mailbox owners can recover", async () => {
    client = 5;
    const account = await person("unverified@reset.test", { emailVerifiedAt: null });
    await forgot(account.email);
    const currentCode = deliveries.at(-1).code;
    const responses = await Promise.all([reset(account.email, currentCode, "FirstNewPassword123"), reset(account.email, currentCode, "SecondNewPassword123")]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
    assert.ok((await User.findById(account.id)).emailVerifiedAt);
  });

  await t.test("someone who registered directly as an agent recovers their password from the agent sign-in", async () => {
    client = 7;
    const account = await person("direct@reset.test", { role: "agent", agentApplication: { status: "approved", agentType: "individual" } });
    const agent = (path, body) => fetch(base + "/auth/agent" + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Domain": "agent", "X-Forwarded-For": "127.0.0.77" }, body: JSON.stringify(body) });
    assert.equal((await agent("/forgot-password", { email: account.email })).status, 200);
    const done = await agent("/reset-password", { email: account.email, code: deliveries.at(-1).code, newPassword: "AgentsNewPassword123" });
    assert.equal(done.status, 200);
    assert.deepEqual(done.headers.getSetCookie().map((value) => value.split("=")[0]).sort(), ["agent_token", "customer_token"], "signed out everywhere");
    assert.equal((await agent("/login", { email: account.email, password: "AgentsNewPassword123" })).status, 200);
    const removed = await person("removed@reset.test", { role: "agent", agentApplication: { status: "removed" } });
    const before = deliveries.length;
    assert.equal((await agent("/forgot-password", { email: removed.email })).status, 200, "the same answer");
    assert.equal(deliveries.length, before, "but no code for a removed agent");
  });

  await t.test("customers who became agents recover the same account and lose old agent sessions too", async () => {
    client = 6;
    const account = await person("dual@reset.test", { role: "agent", customerAccess: true, agentApplication: { status: "approved" } });
    const cookie = "agent_token=" + jwt.sign({ id: account.id, role: "agent", session: "agent" }, process.env.JWT_KEY, { expiresIn: "1h" });
    const agentMe = () => fetch(base + "/auth/agent/me", { headers: { "X-Session-Domain": "agent", Cookie: cookie } });
    assert.equal((await agentMe()).status, 200);
    await forgot(account.email);
    assert.equal((await reset(account.email, deliveries.at(-1).code)).status, 200);
    assert.equal((await agentMe()).status, 401);
    assert.equal((await User.findById(account.id)).role, "agent");
  });
});
