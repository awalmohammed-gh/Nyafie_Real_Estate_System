import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Setting from "../models/Setting.js";
import GoogleLoginChallenge from "../models/GoogleLoginChallenge.js";
import { googleIdentity } from "../utils/googleIdentity.js";
import { createApp } from "../app.js";
import { adminEntryHeaders, customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("Google creates or links a customer only after a verified, single-use, tab-bound sign-in", {
  skip: process.env.RUN_GOOGLE_AUTH_INTEGRATION !== "1", timeout: 90000,
}, async (t) => {
  const previous = { JWT_KEY: process.env.JWT_KEY, GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID, NODE_ENV: process.env.NODE_ENV };
  Object.assign(process.env, { JWT_KEY: "google-auth-integration-signing-key", GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com", NODE_ENV: "development" });
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  await isolatedMongo(t);
  await Setting.create({ key: "platform" });
  const payloads = new Map();
  t.mock.method(googleIdentity, "verify", async (credential, audience) => {
    assert.equal(audience, process.env.GOOGLE_CLIENT_ID);
    if (!payloads.has(credential)) throw new Error("Invalid signature");
    return payloads.get(credential);
  });
  const app = createApp({ initialize: async () => {} });
  app.set("trust proxy", 1);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let client = 1, counter = 0;
  const request = (path, body, { proof = customerTabHeaders("customer")["X-Customer-Tab"], session = "customer", cookie } = {}) => fetch(base + path, {
    method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "X-Session-Domain": session, ...(session === "admin" ? adminEntryHeaders() : {}), "X-Forwarded-For": `127.0.0.${client}`, ...(proof ? { "X-Customer-Tab": proof } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const challenge = async () => {
    const response = await request("/auth/customer/google/challenge", {});
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  const tokenFor = (pending, fields = {}) => {
    const credential = `mock-google-token-${++counter}`;
    payloads.set(credential, { sub: "google-new-person", email: "newcustomer@gmail.com", email_verified: true, given_name: "Ama", family_name: "Mensah", iss: "https://accounts.google.com", aud: process.env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 300, nonce: pending.nonce, ...fields });
    return credential;
  };
  const signIn = async (fields = {}) => { const pending = await challenge(); return request("/auth/customer/google", { credential: tokenFor(pending, fields), challenge: pending.challenge, role: "admin", isActive: true }); };
  const person = (email, fields = {}) => User.create({ firstName: "Existing", lastName: "Customer", email, password: "OriginalPassword123", emailVerifiedAt: new Date(), ...fields });

  await t.test("missing configuration, wrong session domain and absent tab proof cannot start sign-in", async () => {
    assert.equal((await request("/auth/customer/google/challenge", {}, { proof: null })).status, 400);
    assert.equal((await request("/auth/customer/google/challenge", {}, { session: "admin" })).status, 403);
    const configured = process.env.GOOGLE_CLIENT_ID;
    try {
      delete process.env.GOOGLE_CLIENT_ID;
      assert.equal((await request("/auth/customer/google/challenge", {})).status, 503);
    } finally { process.env.GOOGLE_CLIENT_ID = configured; }
  });

  await t.test("new and returning Google users share one verified customer account", async () => {
    const response = await signIn();
    assert.equal(response.status, 200);
    const data = (await response.json()).data;
    assert.equal(data.created, true);
    assert.equal(data.user.role, "user");
    assert.ok(data.user.emailVerifiedAt);
    assert.equal(data.user.googleId, undefined);
    assert.equal(data.user.password, undefined);
    const cookie = response.headers.getSetCookie()[0].split(";")[0];
    assert.equal((await request("/auth/customer/me", undefined, { cookie })).status, 200);
    assert.equal((await request("/auth/admin/me", undefined, { session: "admin", cookie })).status, 401);
    assert.equal((await (await signIn()).json()).data.created, false);
    assert.equal(await User.countDocuments({ email: "newcustomer@gmail.com" }), 1);
  });

  await t.test("credentials are rejected when forged, expired, reused or bound to another tab or nonce", async () => {
    client = 2;
    const pending = await challenge();
    const credential = tokenFor(pending);
    assert.equal((await request("/auth/customer/google", { credential: "forged", challenge: pending.challenge })).status, 401);
    assert.equal((await request("/auth/customer/google", { credential, challenge: pending.challenge }, { proof: "cd".repeat(32) })).status, 401);
    assert.equal((await request("/auth/customer/google", { credential: tokenFor(pending, { nonce: "wrong" }), challenge: pending.challenge })).status, 401);
    assert.equal((await request("/auth/customer/google", { credential: tokenFor(pending, { exp: 0 }), challenge: pending.challenge })).status, 401);
    assert.equal((await request("/auth/customer/google", { credential, challenge: pending.challenge })).status, 200);
    assert.equal((await request("/auth/customer/google", { credential, challenge: pending.challenge })).status, 401);
    const expired = await challenge();
    await GoogleLoginChallenge.updateMany({}, { expiresAt: new Date(0) });
    assert.equal((await request("/auth/customer/google", { credential: tokenFor(expired), challenge: expired.challenge })).status, 401);
    assert.equal((await signIn({ sub: "third-party", email: "person@third-party.test" })).status, 401);
  });

  await t.test("verified Gmail customers link without losing their password or records", async () => {
    client = 3;
    const existing = await person("existing@gmail.com", { preferences: { inquiryUpdates: false } });
    const response = await signIn({ sub: "google-existing", email: existing.email });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.user.id, existing.id);
    const linked = await User.findById(existing.id).select("+password +googleId");
    assert.equal(linked.googleId, "google-existing");
    assert.equal(await linked.matchPassword("OriginalPassword123"), true);
    assert.equal(linked.preferences.inquiryUpdates, false);
    assert.equal((await signIn({ sub: "different-google-person", email: existing.email })).status, 409);
    assert.equal((await signIn({ sub: "google-existing", email: "changed@gmail.com" })).status, 409);
  });

  await t.test("unverified pre-registrations lose their old password and sessions after Google proves ownership", async () => {
    const existing = await person("unverified@gmail.com", { emailVerifiedAt: null });
    const oldCookie = "customer_token=" + jwt.sign({ id: existing.id, role: "user", session: "customer", ...customerTabClaims("customer") }, process.env.JWT_KEY);
    assert.equal((await signIn({ sub: "google-unverified", email: existing.email })).status, 200);
    const linked = await User.findById(existing.id).select("+password +sessionVersion");
    assert.equal(await linked.matchPassword("OriginalPassword123"), false);
    assert.ok(linked.sessionVersion);
    assert.ok(linked.emailVerifiedAt);
    assert.equal((await request("/auth/customer/me", undefined, { cookie: oldCookie })).status, 401);
  });

  await t.test("inactive customers, admins and standalone agents cannot gain customer access", async () => {
    client = 4;
    for (const [label, fields] of [["inactive", { isActive: false }], ["admin", { role: "admin" }], ["agent", { role: "agent" }]]) {
      const account = await person(`${label}@gmail.com`, fields);
      assert.equal((await signIn({ sub: `google-${label}`, email: account.email })).status, 403);
    }
    const dual = await person("dual@gmail.com", { role: "agent", customerAccess: true, agentApplication: { status: "approved" } });
    assert.equal((await signIn({ sub: "google-dual", email: dual.email })).status, 200);
    assert.equal((await User.findById(dual.id)).role, "agent");
  });
});
