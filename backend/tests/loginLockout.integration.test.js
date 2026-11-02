import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Setting from "../models/Setting.js";
import LoginAttempt from "../models/LoginAttempt.js";
import { createLoginAttempts, LOGIN_LOCK_MS } from "../utils/loginAttempts.js";
import { isolatedMongo } from "./support/isolatedMongo.js";
import { customerTabHeaders } from "./support/customerTab.js";

test("production failed-password lockouts persist across instances and protect every login area", {
  skip: process.env.RUN_LOGIN_LOCKOUT_INTEGRATION !== "1", timeout: 90000,
}, async (t) => {
  await isolatedMongo(t);
  const previous = { NODE_ENV: process.env.NODE_ENV, JWT_KEY: process.env.JWT_KEY, PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL, ADMIN_ENTRY_PATH: process.env.ADMIN_ENTRY_PATH };
  process.env.NODE_ENV = "production";
  process.env.ADMIN_ENTRY_PATH = "hb-lockout-fixture-entry";
  process.env.JWT_KEY = "production-login-lockout-regression-signing-key";
  process.env.PUBLIC_SITE_URL = "https://nyafie.example";
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  let time = Date.now();
  t.mock.method(Date, "now", () => time);
  await Setting.create({ key: "platform", agent: { requireSubscription: false } });
  const users = {};
  for (const [session, role] of Object.entries({ customer: "user", agent: "agent", admin: "admin" })) {
    users[session] = await User.create({ emailVerifiedAt: new Date(), firstName: "Login", lastName: session, email: `${session}@example.test`, password: "CorrectPassword123", role, ...(role === "agent" ? { agentApplication: { status: "incomplete" } } : {}) });
  }
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const signIn = (session, email, password = "WrongPassword123", path = `/api/auth/${session}/login`) => fetch(base + path, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Session-Domain": session, ...customerTabHeaders(session) }, body: JSON.stringify({ email, password }),
  });

  for (const session of Object.keys(users)) {
    await t.test(`${session}: only failures count; the third locks correct passwords until the deadline`, async () => {
      const email = users[session].email;
      for (let index = 0; index < 6; index++) assert.equal((await signIn(session, email, "CorrectPassword123")).status, 200, "successful logins do not consume the failure budget");
      assert.equal((await signIn(session, email)).status, 401);
      assert.equal((await signIn(session, email)).status, 401);
      assert.equal((await signIn(session, email, "CorrectPassword123")).status, 200, "success clears two earlier failures");
      assert.equal((await signIn(session, email)).status, 401);
      time += 10 * 60 * 1000;
      assert.equal((await signIn(session, ` ${email.toUpperCase()} `)).status, 401);
      time += 10 * 60 * 1000;
      const third = await signIn(session, email);
      assert.equal(third.status, 429);
      assert.equal(third.headers.get("retry-after"), "1800");
      assert.equal((await third.json()).attemptsRemaining, 0);
      assert.equal(third.headers.getSetCookie().length, 0);
      // Re-instantiating the limiter simulates a fresh server/function instance.
      const freshInstance = createLoginAttempts({ persistent: () => true });
      assert.equal((await freshInstance.check(email)).retryAfter, 1800);
      const otherArea = session === "agent" ? "customer" : "agent";
      assert.equal((await signIn(otherArea, email, "CorrectPassword123")).status, 429, "switching login areas cannot bypass the lock");
      time += LOGIN_LOCK_MS - 1000;
      const blocked = await signIn(session, email, "CorrectPassword123");
      assert.equal(blocked.status, 429);
      assert.equal(blocked.headers.get("retry-after"), "1");
      time += 1000;
      assert.equal((await signIn(session, email, "CorrectPassword123")).status, 200, "the full lock expires without relying on TTL deletion");
    });
  }

  await t.test("legacy customer aliases share the budget, and unknown accounts give the same responses", async () => {
    assert.equal((await signIn("customer", "unknown@example.test")).status, 401);
    assert.equal((await signIn("customer", " UNKNOWN@example.test ", "WrongPassword123", "/api/auth/login")).status, 401);
    const third = await signIn("customer", "unknown@example.test");
    assert.equal(third.status, 429);
    assert.equal(third.headers.get("retry-after"), "1800");
    assert.equal((await signIn("customer", users.customer.email, "CorrectPassword123")).status, 200, "another account remains available");
  });

  await t.test("concurrent failures cap atomically; records contain no emails or passwords", async () => {
    const instances = Array.from({ length: 6 }, () => createLoginAttempts({ persistent: () => true }));
    const results = await Promise.all(instances.map((instance) => instance.failure("parallel@example.test")));
    assert.deepEqual(results.map((r) => r.failures).sort(), [1, 2, 3, 3, 3, 3]);
    assert.equal((await instances[0].check("parallel@example.test")).retryAfter, 1800);
    assert.equal((await instances[1].success("parallel@example.test")).retryAfter, 1800);
    for (const record of await LoginAttempt.collection.find().toArray()) {
      assert.match(record._id, /^[a-f\d]{64}$/);
      assert.doesNotMatch(JSON.stringify(record), /@|CorrectPassword|WrongPassword/);
    }
  });
});
