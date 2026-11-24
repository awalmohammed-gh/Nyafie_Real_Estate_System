import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Setting, { clearSettingsCache } from "../models/Setting.js";
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
    const oldCookie = "customer_token=" + jwt.sign({ id: existing.id, role: "user", session: "customer", ...customerTabClaims("customer") }, process.env.JWT_KEY, { expiresIn: "1h" });
    assert.equal((await signIn({ sub: "google-unverified", email: existing.email })).status, 200);
    const linked = await User.findById(existing.id).select("+password +sessionVersion");
    assert.equal(await linked.matchPassword("OriginalPassword123"), false);
    assert.ok(linked.sessionVersion);
    assert.ok(linked.emailVerifiedAt);
    assert.equal((await request("/auth/customer/me", undefined, { cookie: oldCookie })).status, 401);
  });

  await t.test("a Google account creates its own password and can then sign in by typing it", async () => {
    client = 5;
    const own = "a long passphrase for nyafie", email = "typed@gmail.com";
    const cookieOf = (response) => response.headers.getSetCookie()[0].split(";")[0];
    const put = (cookie, body) => fetch(base + "/auth/customer/me/password", { method: "PUT", headers: { "Content-Type": "application/json", "X-Session-Domain": "customer", "X-Forwarded-For": "127.0.0.5", ...customerTabHeaders("customer"), Cookie: cookie }, body: JSON.stringify(body) });
    const login = (password) => request("/auth/customer/login", { email, password });
    const first = await signIn({ sub: "google-typed", email });
    const data = (await first.json()).data;
    assert.equal(data.created, true);
    assert.equal(data.user.passwordMissing, true);
    assert.equal(data.user.passwordSetAt, undefined);
    assert.equal((await login(own)).status, 401, "nothing to type yet");

    // A session that didn't just come from Google (older, or stolen) can't choose the password
    const id = data.user.id;
    const session = (claims) => "customer_token=" + jwt.sign({ id, role: "user", session: "customer", ...customerTabClaims("customer"), ...claims }, process.env.JWT_KEY, { expiresIn: "1h" });
    const now = Math.floor(Date.now() / 1000);
    assert.equal((await put(session({}), { newPassword: own })).status, 403, "not a Google session");
    assert.equal((await put(session({ google: true, iat: now - 16 * 60 }), { newPassword: own })).status, 403, "too long ago");

    const fresh = cookieOf(first);
    assert.equal((await put(fresh, { newPassword: "short" })).status, 400, "the usual password rules");
    const saved = await put(fresh, { newPassword: own });
    assert.equal(saved.status, 200);
    assert.equal((await request("/auth/customer/me", undefined, { cookie: fresh })).status, 401, "other sessions end");
    const me = (await (await request("/auth/customer/me", undefined, { cookie: cookieOf(saved) })).json()).data;
    assert.equal(me.passwordMissing, false);
    const typed = await login(own);
    assert.equal(typed.status, 200);
    assert.equal((await typed.json()).data.id, id, "the same account");
    const again = await signIn({ sub: "google-typed", email });
    assert.equal((await again.json()).data.user.passwordMissing, false, "Google still works, and doesn't ask again");
    assert.notEqual((await put(cookieOf(again), { newPassword: "another long passphrase" })).status, 200, "from now on the current password is needed");
  });

  await t.test("a Google customer needs a password before opening agent onboarding, and gets no agent powers from it", async () => {
    client = 7;
    const email = "future.agent@gmail.com", own = "a long passphrase for agents";
    const cookieOf = (response, name = "customer_token") => response.headers.getSetCookie().find((value) => value.startsWith(name)).split(";")[0];
    const call = (method, path, cookie, body, session = "customer") => fetch(base + path, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": session, "X-Forwarded-For": "127.0.0.7", ...customerTabHeaders(session), Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    await Setting.updateOne({ key: "platform" }, { $set: { "agent.requireSubscription": false } });
    clearSettingsCache();
    const first = await signIn({ sub: "google-future-agent", email });
    const { id } = (await first.json()).data.user;
    const cookie = cookieOf(first);
    const refused = await call("POST", "/auth/customer/become-agent", cookie, {});
    assert.equal(refused.status, 409);
    assert.equal((await refused.json()).code, "PASSWORD_REQUIRED");
    assert.equal((await User.findById(id)).role, "user");

    // Later, the session is no longer fresh: the same Google account confirms it, another one can't
    const now = Math.floor(Date.now() / 1000);
    const stale = "customer_token=" + jwt.sign({ id, role: "user", session: "customer", google: true, iat: now - 3600, ...customerTabClaims("customer") }, process.env.JWT_KEY, { expiresIn: "2h" });
    assert.equal((await (await call("PUT", "/auth/customer/me/password", stale, { newPassword: own })).json()).code, "GOOGLE_CONFIRM");
    const confirm = async (fields, accountId = id) => { const pending = await challenge(); return request("/auth/customer/google", { credential: tokenFor(pending, fields), challenge: pending.challenge, accountId }); };
    assert.equal((await confirm({ sub: "google-someone-else", email: "someone.else@gmail.com" })).status, 403);
    assert.equal(await User.countDocuments({ email: "someone.else@gmail.com" }), 0, "confirming never creates an account");
    assert.equal((await confirm({ sub: "google-future-agent", email }, { $ne: null })).status, 400);
    assert.equal((await confirm({ sub: "google-future-agent", email }, "not-an-id")).status, 403);
    const confirmed = await confirm({ sub: "google-future-agent", email });
    assert.equal(confirmed.status, 200);
    const saved = await call("PUT", "/auth/customer/me/password", cookieOf(confirmed), { newPassword: own });
    assert.equal(saved.status, 200);

    const opened = await call("POST", "/auth/customer/become-agent", cookieOf(saved), {});
    assert.equal(opened.status, 200);
    const agent = (await opened.json()).data;
    assert.equal(agent.id, id, "the same account");
    assert.equal(agent.onboarding.nextPath, "/agent/onboarding/profile", "the forms come first");
    const agentCookie = cookieOf(opened, "agent_token");
    assert.equal((await call("GET", "/agents/dashboard", agentCookie, undefined, "agent")).status, 403);
    assert.equal((await call("POST", "/agents/application/submit", agentCookie, {}, "agent")).status, 400, "not without the profile and proof");
    assert.equal((await call("POST", "/auth/agent/login", "", { email, password: own }, "agent")).status, 200, "the agent area opens with the password");
    assert.equal((await call("POST", "/auth/agent/google", "", { credential: "x", challenge: "y" }, "agent")).status, 403, "there is no Google sign-in for agents");
  });

  await t.test("who is asked for a password: only Google accounts without one", async () => {
    client = 6;
    const missing = async (response) => (await response.json()).data.user.passwordMissing;
    const registered = await person("registered@gmail.com");
    assert.equal(await missing(await signIn({ sub: "google-registered", email: registered.email })), false, "they registered with a password");
    const unproved = await person("unproved@gmail.com", { emailVerifiedAt: null });
    assert.equal(await missing(await signIn({ sub: "google-unproved", email: unproved.email })), true, "the stranger's password was removed");
    // Linked before this was recorded: typing the password proves they know it
    const older = await person("older@gmail.com", { googleId: "google-older" });
    await User.updateOne({ _id: older._id }, { $unset: { passwordSetAt: 1 } });
    assert.equal(await missing(await signIn({ sub: "google-older", email: older.email })), true);
    assert.equal((await request("/auth/customer/login", { email: older.email, password: "OriginalPassword123" })).status, 200);
    assert.equal(await missing(await signIn({ sub: "google-older", email: older.email })), false);
  });

  await t.test("inactive customers, admins, and suspended or removed agents cannot gain customer access", async () => {
    client = 4;
    for (const [label, fields, reason] of [["inactive", { isActive: false }, /suspended/], ["admin", { role: "admin" }, /admin account/], ["suspended-agent", { role: "agent", isActive: false, agentApplication: { status: "suspended" } }, /suspended/], ["removed-agent", { role: "agent", agentApplication: { status: "removed" } }, /no longer active/]]) {
      const account = await person(`${label}@gmail.com`, fields);
      const refused = await signIn({ sub: `google-${label}`, email: account.email });
      assert.equal(refused.status, 403);
      assert.match((await refused.json()).message, reason);
      assert.equal((await User.findById(account.id).select("+googleId")).googleId, undefined, "not linked");
    }
  });

  await t.test("an agent's Google sign-in opens the customer area only; the agent area needs the password", async () => {
    client = 8;
    const agent = await person("direct.agent@gmail.com", { role: "agent", agentApplication: { status: "approved", agentType: "individual" } });
    const response = await signIn({ sub: "google-direct-agent", email: agent.email });
    assert.equal(response.status, 200);
    assert.deepEqual(response.headers.getSetCookie().map((value) => value.split("=")[0]), ["customer_token"]);
    const customer = response.headers.getSetCookie()[0].split(";")[0];
    const saved = await User.findById(agent.id).select("+password");
    assert.equal(saved.role, "agent");
    assert.equal(await saved.matchPassword("OriginalPassword123"), true, "their password still works");
    const open = (cookie) => request("/auth/customer/become-agent", {}, { cookie });
    const refused = await open(customer);
    assert.equal(refused.status, 403);
    assert.equal((await refused.json()).code, "AGENT_SIGN_IN");
    assert.equal(refused.headers.getSetCookie().length, 0, "no agent session");
    // Already signed in to their own agent area with the password: it opens
    const signedIn = await request("/auth/agent/login", { email: agent.email, password: "OriginalPassword123" }, { session: "agent" });
    const own = signedIn.headers.getSetCookie()[0].split(";")[0];
    assert.equal((await open(`${customer}; ${own}`)).status, 200);
    // Someone else's agent session doesn't help
    const other = await person("other.agent@gmail.com", { role: "agent", agentApplication: { status: "approved", agentType: "individual" } });
    const others = (await request("/auth/agent/login", { email: other.email, password: "OriginalPassword123" }, { session: "agent" })).headers.getSetCookie()[0].split(";")[0];
    assert.equal((await open(`${customer}; ${others}`)).status, 403);
  });
});
