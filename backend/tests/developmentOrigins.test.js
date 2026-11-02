import { test } from "node:test";
import assert from "node:assert/strict";
import User from "../models/User.js";
import { createApp } from "../app.js";
import { customerTabHeaders } from "./support/customerTab.js";
import { clientOrigins, paymentReturnUrl } from "../config/runtime.js";

const environment = (t, values) => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
};

test("development login accepts both Vite loopback origins and rejects unrelated origins", async (t) => {
  environment(t, { NODE_ENV: "development", PUBLIC_SITE_URL: "http://localhost:5173", CLIENT_URL: "http://localhost:5173", JWT_KEY: "development-origin-regression-test-key" });
  const user = new User({ emailVerifiedAt: new Date(), firstName: "Local", lastName: "Test", email: "local@example.test", role: "user", isActive: true });
  user.matchPassword = async (password) => password === "FixturePassword123";
  const query = (value) => ({ then: (yes, no) => Promise.resolve(value).then(yes, no), select: () => query(value), populate: () => query(value) });
  t.mock.method(User, "findOne", () => query(user));
  t.mock.method(User, "findById", () => query(user));
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const signIn = (origin, extra = {}) => fetch(`${base}/api/auth/customer/login`, { method: "POST", headers: { ...customerTabHeaders(), "Content-Type": "application/json", "X-Session-Domain": "customer", ...(origin ? { Origin: origin } : {}), ...extra }, body: JSON.stringify({ email: user.email, password: "FixturePassword123" }) });
  for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173"]) {
    assert.ok(clientOrigins().includes(origin));
    const preflight = await fetch(`${base}/api/auth/customer/login`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-session-domain" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    const response = await signIn(origin);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).message, "Signed in");
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.match(response.headers.get("set-cookie"), /^customer_token=/);
    assert.equal(paymentReturnUrl({ get: () => origin }), origin);
  }
  assert.equal((await signIn(null, { Referer: "http://127.0.0.1:5173/login" })).status, 200);
  for (const origin of ["https://untrusted.example", "http://127.0.0.1:9999", "http://127.0.0.1.attacker.example:5173", "null"]) {
    const response = await signIn(origin);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).message, "Request blocked: untrusted origin.");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
});

test("production and production previews do not implicitly trust local development origins", (t) => {
  environment(t, { NODE_ENV: "production", PUBLIC_SITE_URL: "https://homebase.example", CLIENT_URL: "https://homebase.example", VERCEL_ENV: "production", VERCEL_URL: "homebase-preview.vercel.app" });
  for (const preview of [false, true]) {
    process.env.VERCEL_ENV = preview ? "preview" : "production";
    assert.equal(clientOrigins().includes("http://localhost:5173"), false);
    assert.equal(clientOrigins().includes("http://127.0.0.1:5173"), false);
    assert.equal(paymentReturnUrl({ get: () => "http://127.0.0.1:5173" }), "https://homebase.example");
  }
});
