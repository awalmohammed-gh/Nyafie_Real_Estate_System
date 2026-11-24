import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { adminEntryHeaders, customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import PendingRegistration from "../models/PendingRegistration.js";
import EmailVerification from "../models/EmailVerification.js";
import Setting from "../models/Setting.js";
import { verificationMailer } from "../utils/email.js";
import { googleIdentity } from "../utils/googleIdentity.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

const PASSWORD = "LongEnoughPassword123";

test("an account's email is proved to be the person's: Gmail sign-ups, one per inbox, agents too", { skip: process.env.RUN_EMAIL_OWNERSHIP_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  const saved = Object.fromEntries(["JWT_KEY", "SMTP_USER", "SMTP_APP_PASSWORD", "SIGNUP_EMAILS", "GOOGLE_CLIENT_ID", "NODE_ENV"].map((key) => [key, process.env[key]]));
  t.after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  Object.assign(process.env, { JWT_KEY: "email-ownership-signing-key-at-least-32-characters", SMTP_USER: "sender@example.test", SMTP_APP_PASSWORD: "not-a-real-password", GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com", NODE_ENV: "development" });
  delete process.env.SIGNUP_EMAILS;
  await isolatedMongo(t);
  await Setting.create({ key: "platform", agent: { requireSubscription: false } });
  const codes = new Map();
  t.mock.method(verificationMailer, "send", async (email, code) => { codes.set(email, code); });
  const app = createApp({ initialize: async () => {} });
  app.set("trust proxy", 1);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  let client = 1;
  const call = async (session, path, { body, cookie, method = body ? "POST" : "GET" } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": session, "X-Forwarded-For": `10.0.0.${client}`, ...customerTabHeaders(session), ...(session === "admin" ? adminEntryHeaders() : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const cookies = response.headers.getSetCookie().map((value) => value.split(";")[0]).filter((value) => /_token=ey/.test(value));
    return { ...(await response.json()), code: response.status, cookie: cookies[0] };
  };
  const token = (user, session, role) => `${session}_token=${jwt.sign({ id: user.id, role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" })}`;
  const customer = (email) => call("customer", "/auth/customer/register", { body: { firstName: "Kofi", lastName: "Test", email, password: PASSWORD } });
  const agent = (email) => call("agent", "/auth/agent/register", { body: { fullName: "Ama Agent", email, phone: "0241234567", password: PASSWORD, confirmPassword: PASSWORD } });
  const finish = (session, started, email) => call(session, `/auth/${session}/verify-email`, { body: { challenge: started.data.challenge, code: codes.get(email) } });
  const person = (email, fields = {}) => User.create({ firstName: "Old", lastName: "Account", email, password: PASSWORD, emailVerifiedAt: null, ...fields });

  await t.test("new email/password sign-ups need a Gmail address", async () => {
    for (const email of ["kofi@yahoo.com", "kofi@company.com", "kofi@gmail.com.evil.test", "kofi@notgmail.com", "gmail.com@evil.test", "+tag@gmail.com"]) {
      client += 1;
      const refused = await customer(email);
      assert.equal(refused.code, 400, email);
      assert.match(refused.message, /Gmail/);
      assert.equal((await agent(email)).code, 400, email);
    }
    assert.equal(await PendingRegistration.countDocuments(), 0);
    client += 1;
    process.env.SIGNUP_EMAILS = "any";
    assert.equal((await customer("kofi@company.com")).code, 202, "can be opened up again");
    delete process.env.SIGNUP_EMAILS;
    await PendingRegistration.deleteMany({});
  });

  await t.test("no account exists until the code from that inbox is entered", async () => {
    client += 1;
    const started = await customer("Kofi.Mensah@gmail.com");
    assert.equal(started.code, 202);
    assert.equal(await User.countDocuments(), 0);
    assert.equal((await call("customer", "/auth/customer/verify-email", { body: { challenge: started.data.challenge, code: "000000" === codes.get("kofi.mensah@gmail.com") ? "111111" : "000000" } })).code, 400);
    const done = await finish("customer", started, "kofi.mensah@gmail.com");
    assert.equal(done.code, 201);
    assert.equal(done.data.emailKey, undefined);
    const user = await User.findOne({ email: "kofi.mensah@gmail.com" }).select("+emailKey");
    assert.equal(user.emailKey, "kofimensah@gmail.com");
    assert.ok(user.emailVerifiedAt);
  });

  await t.test("one Gmail inbox opens one account, however it is spelled", async () => {
    for (const email of ["kofimensah@gmail.com", "k.o.f.i.mensah@gmail.com", "kofi.mensah+2@gmail.com", "KOFIMENSAH@googlemail.com"]) {
      client += 1;
      assert.equal((await customer(email)).code, 409, email);
      assert.equal((await agent(email)).code, 409, email);
    }
    client += 1;
    assert.equal((await customer("kofimensah2@gmail.com")).code, 202, "a different inbox");
    // Accounts from before inbox keys were stored count too
    await person("old.person@gmail.com");
    assert.equal((await customer("oldperson+x@gmail.com")).code, 409);
    assert.equal((await customer("oldpersons@gmail.com")).code, 202);
  });

  await t.test("two spellings finishing at the same moment create one account", async () => {
    client += 1;
    const [a, b] = [await customer("race.one@gmail.com"), await agent("raceone@gmail.com")];
    assert.deepEqual([a.code, b.code], [202, 202], "neither is finished yet");
    const results = await Promise.all([finish("customer", a, "race.one@gmail.com"), finish("agent", b, "raceone@gmail.com")]);
    assert.deepEqual(results.map((result) => result.code).sort(), [201, 409]);
    assert.equal(await User.countDocuments({ email: /^race\.?one@/ }), 1);
  });

  await t.test("an agent whose email isn't proved enters a code before anything opens", async () => {
    client += 1;
    const old = await person("old.agent@company.test", { role: "agent", agentApplication: { status: "approved", agentType: "individual" } });
    assert.equal((await call("agent", "/agents/counts", { cookie: token(old, "agent", "agent") })).code, 401, "an existing session stops too");
    const login = await call("agent", "/auth/agent/login", { body: { email: old.email, password: PASSWORD } });
    assert.equal(login.code, 202);
    assert.equal(login.cookie, undefined, "no session yet");
    assert.equal(login.data.verificationRequired, true);
    assert.equal((await call("customer", "/auth/customer/verify-email", { body: { challenge: login.data.challenge, code: codes.get(old.email) } })).code, 401, "an agent's challenge opens nothing for customers");
    const wrong = codes.get(old.email) === "123456" ? "654321" : "123456";
    assert.equal((await call("agent", "/auth/agent/verify-email", { body: { challenge: login.data.challenge, code: wrong } })).code, 400);
    assert.equal((await call("agent", "/auth/agent/resend-verification", { body: { challenge: login.data.challenge } })).code, 429);
    const done = await finish("agent", login, old.email);
    assert.equal(done.code, 200, JSON.stringify(done));
    assert.equal((await call("agent", "/agents/counts", { cookie: done.cookie })).code, 200);
    assert.equal((await call("agent", "/auth/agent/login", { body: { email: old.email, password: PASSWORD } })).code, 200, "asked once only");
    assert.equal((await finish("agent", login, old.email)).code, 409);
  });

  await t.test("five wrong codes use it up, and a removed agent gets none", async () => {
    client += 1;
    const guessed = await person("guessed@company.test", { role: "agent", agentApplication: { status: "approved", agentType: "individual" } });
    const login = await call("agent", "/auth/agent/login", { body: { email: guessed.email, password: PASSWORD } });
    const wrong = codes.get(guessed.email) === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) assert.equal((await call("agent", "/auth/agent/verify-email", { body: { challenge: login.data.challenge, code: wrong } })).code, 400);
    assert.equal((await finish("agent", login, guessed.email)).code, 400, "even the right one, now");
    assert.equal((await User.findById(guessed.id)).emailVerifiedAt, null);
    const removed = await person("removed@company.test", { role: "agent", agentApplication: { status: "removed", agentType: "individual" } });
    assert.equal((await call("agent", "/auth/agent/login", { body: { email: removed.email, password: PASSWORD } })).code, 403);
    assert.equal(await EmailVerification.exists({ _id: removed._id }), null);
  });

  await t.test("a suspended agent can verify and read their status, but gains no access", async () => {
    client += 1;
    const suspended = await person("suspended@company.test", { role: "agent", isActive: false, agentApplication: { status: "approved", agentType: "individual" } });
    const login = await call("agent", "/auth/agent/login", { body: { email: suspended.email, password: PASSWORD } });
    const done = await finish("agent", login, suspended.email);
    assert.equal(done.code, 200);
    assert.equal((await call("agent", "/auth/agent/me", { cookie: done.cookie })).code, 200);
    assert.equal((await call("agent", "/agents/counts", { cookie: done.cookie })).code, 403);
  });

  await t.test("an admin changing an email asks for proof again, and can't reuse another person's inbox", async () => {
    client += 1;
    const admin = await person("admin@company.test", { role: "admin", emailVerifiedAt: new Date() });
    const cookie = token(admin, "admin", "admin");
    const target = await person("moving@company.test", { role: "agent", emailVerifiedAt: new Date(), agentApplication: { status: "approved", agentType: "individual" } });
    const before = token(target, "agent", "agent");
    assert.equal((await call("agent", "/agents/counts", { cookie: before })).code, 200);
    const change = (email) => call("admin", `/admin/users/${target.id}`, { method: "PUT", cookie, body: { email } });
    assert.equal((await change("kofimensah+agent@gmail.com")).code, 409);
    assert.equal((await change("moved@company.test")).code, 200);
    assert.equal((await call("agent", "/agents/counts", { cookie: before })).code, 401);
    const login = await call("agent", "/auth/agent/login", { body: { email: "moved@company.test", password: PASSWORD } });
    assert.equal(login.code, 202);
    assert.equal((await finish("agent", login, "moved@company.test")).code, 200);
    const unverified = (await call("admin", "/admin/customers?filter=unverified", { cookie })).data;
    assert.deepEqual(unverified.items.map((user) => user.email), ["old.person@gmail.com"]);
    assert.equal(unverified.counts.unverified, 1);
    const agents = (await call("admin", "/admin/providers?status=unverified", { cookie })).data;
    assert.deepEqual(agents.items.map((user) => user.email), ["guessed@company.test"]);
  });

  await t.test("Google sign-in joins the same inbox's account instead of opening a second one", async () => {
    client += 1;
    let claims;
    t.mock.method(googleIdentity, "verify", async () => claims);
    const google = async (email, sub) => {
      const { data } = await call("customer", "/auth/customer/google/challenge", { body: {} });
      claims = { sub, email, email_verified: true, given_name: "Kofi", family_name: "Mensah", iss: "https://accounts.google.com", aud: process.env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 300, nonce: data.nonce };
      return call("customer", "/auth/customer/google", { body: { credential: `credential-${sub}-${email}`, challenge: data.challenge } });
    };
    const joined = await google("kofimensah@gmail.com", "google-kofi");
    assert.equal(joined.code, 200, JSON.stringify(joined));
    assert.equal(joined.data.created, false);
    assert.equal(joined.data.user.email, "kofi.mensah@gmail.com");
    assert.equal((await google("kofimensah@gmail.com", "google-kofi")).data.created, false, "and again next time");
    assert.equal((await google("kofi.mensah@gmail.com", "google-someone-else")).code, 409, "another Google identity can't take it");
    const workspace = await google("boss@gmail.com", "google-boss");
    assert.equal(workspace.data.created, true);
    assert.equal((await customer("bo.ss@gmail.com")).code, 409, "Google accounts count as that inbox's account");
    // Two older accounts already share an inbox: neither is chosen silently
    await person("twin.one@gmail.com", { emailVerifiedAt: new Date() });
    await person("twinone+b@gmail.com", { emailVerifiedAt: new Date() });
    assert.equal((await google("twinone@gmail.com", "google-twin")).code, 409);
    assert.equal((await google("twin.one@gmail.com", "google-twin")).data.user.email, "twin.one@gmail.com", "the exact address is still theirs");
  });
});
