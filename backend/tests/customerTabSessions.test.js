import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { createApp } from "../app.js";
import { CUSTOMER_SESSION_SECONDS, tabSecretHash } from "../utils/customerTabSession.js";
import { TEST_CUSTOMER_TAB } from "./support/customerTab.js";

const query = (value) => ({ then: (yes, no) => Promise.resolve(value).then(yes, no), select: () => query(value), populate: () => query(value) });
const setup = async (t) => {
  t.mock.method(console, "error", () => {});
  process.env.JWT_KEY = "customer-tab-regression-signing-key";
  process.env.NODE_ENV = "development";
  const user = new User({ firstName: "Tab", lastName: "Customer", email: "tab@example.test", role: "user", isActive: true });
  user.matchPassword = async (value) => value === "CorrectPassword123";
  t.mock.method(User, "findOne", ({ email }) => query(email === user.email ? user : null));
  t.mock.method(User, "findById", () => query(user));
  const app = createApp({ initialize: async () => {} });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(done => server.once("listening", done));
  t.after(() => new Promise(done => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { method = "GET", cookie, proof = TEST_CUSTOMER_TAB, body } = {}) => fetch(base + path, {
    method, headers: { "X-Session-Domain": "customer", ...(proof ? { "X-Customer-Tab": proof } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { request, user };
};

test("customer cookies require the original tab proof and expire after two hours", async (t) => {
  const { request, user } = await setup(t);
  const body = { email: user.email, password: "CorrectPassword123" };
  assert.equal((await request("/api/auth/customer/login", { method: "POST", proof: null, body })).status, 400);
  const signedIn = await request("/api/auth/customer/login", { method: "POST", body });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.headers.get("cache-control"), "private, no-store");
  const header = signedIn.headers.getSetCookie()[0];
  assert.match(header, /HttpOnly/);
  assert.doesNotMatch(header, /Max-Age|Expires=/i);
  const cookie = header.split(";")[0];
  const token = cookie.slice("customer_token=".length);
  const payload = jwt.verify(token, process.env.JWT_KEY);
  assert.equal(payload.exp - payload.iat, CUSTOMER_SESSION_SECONDS);
  assert.equal(payload.tabHash, tabSecretHash(TEST_CUSTOMER_TAB));
  assert.equal(payload.tabSecret, undefined);
  for (const proof of [null, "cd".repeat(32), "invalid"]) {
    const denied = await request("/api/auth/customer/me", { cookie, proof });
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.getSetCookie().length, 0, "new tabs must not erase a working tab's cookie");
  }
  assert.equal((await request("/api/auth/customer/me", { cookie })).status, 200, "refreshing the same tab remains authenticated");
  const legacy = jwt.sign({ id: user.id, role: "user", session: "customer" }, process.env.JWT_KEY, { expiresIn: "7d" });
  assert.equal((await request("/api/auth/customer/me", { cookie: `customer_token=${legacy}` })).status, 401);
  const expired = jwt.sign({ ...payload, exp: Math.floor(Date.now() / 1000) - 1 }, process.env.JWT_KEY);
  assert.equal((await request("/api/auth/customer/me", { cookie: `customer_token=${expired}` })).status, 401);
  for (const path of ["/api/agents/public", "/api/users/saved"]) assert.equal((await request(path, { cookie, proof: null })).status, 401, path);
});

test("sign-in aliases share five attempts per normalized email and network, with Retry-After", async (t) => {
  const { request } = await setup(t);
  for (let i = 0; i < 5; i++) {
    const response = await request(i % 2 ? "/api/auth/login" : "/api/auth/customer/login", { method: "POST", body: { email: i % 2 ? "  LIMIT@example.test " : "limit@example.test", password: "WrongPassword123" } });
    assert.equal(response.status, 401);
  }
  const limited = await request("/api/auth/customer/login", { method: "POST", body: { email: "limit@example.test", password: "WrongPassword123" } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(limited.headers.get("ratelimit-remaining"), "0");
});
