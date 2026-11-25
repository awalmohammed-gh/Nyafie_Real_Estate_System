import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { deviceLabel, shortIp } from "../utils/sessionDevice.js";
import { MAX_SESSIONS, browserSessionIds, endSessions, hasSession, listSessions, sessionStore, signOut, startSession } from "../utils/sessions.js";
import { TEST_CUSTOMER_TAB } from "./support/customerTab.js";

const KEY = "unit-session-signing-key-0123456789abcdef";
const ID = "0000000000000000000000b1", OTHER = "0000000000000000000000b2";
const setup = (t) => { const old = process.env.JWT_KEY; process.env.JWT_KEY = KEY; t.after(() => { if (old === undefined) delete process.env.JWT_KEY; else process.env.JWT_KEY = old; }); };
const browser = () => {
  const cookies = {};
  return {
    cookies,
    req: { cookies, ip: "102.176.14.9", get: (name) => ({ "X-Customer-Tab": TEST_CUSTOMER_TAB, "User-Agent": "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36" })[name] },
    res: { cookie: (name, value) => { cookies[name] = value; }, clearCookie: (name) => { delete cookies[name]; } },
  };
};
const person = (id) => ({ _id: id, sessionVersion: "" });
const active = async (id) => (await sessionStore.listActive(id, new Date())).map((entry) => String(entry._id));

test("a device is recognisable without keeping its exact details", () => {
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"), "Chrome on Windows");
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0"), "Edge on Windows");
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"), "Safari on iPhone");
  assert.equal(deviceLabel("Mozilla/5.0 (Linux; Android 14; SM-A156B) AppleWebKit/537.36 SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36"), "Samsung Internet on Android");
  for (const odd of [undefined, "", 12, "curl/8"]) assert.equal(deviceLabel(odd), "Unknown device");
  assert.equal(shortIp("102.176.14.9"), "102.176.x.x");
  assert.equal(shortIp("::ffff:102.176.14.9"), "102.176.x.x");
  assert.equal(shortIp("2c0f:2a80:10::7"), "2c0f:2a80:x");
  assert.equal(shortIp("::1"), "this computer");
  for (const odd of [undefined, "", "not an address"]) assert.equal(shortIp(odd), "");
});

test("a sign-in stores a session and the cookie carries only its id", async (t) => {
  setup(t);
  const b = browser();
  const record = await startSession(b.req, b.res, person(ID), "agent");
  const claims = jwt.verify(b.cookies.agent_token, KEY);
  assert.equal(claims.sid, String(record._id));
  assert.equal(JSON.stringify(record).includes(b.cookies.agent_token), false, "the token itself is never stored");
  assert.deepEqual([record.area, record.device, record.ip, record.startedWith], ["agent", "Chrome on Windows", "102.176.x.x", "password"]);
  assert.equal(Math.round((record.expiresAt - record.createdAt) / 3600000), 24 * 7);
  assert.equal(await hasSession(b.req, "agent", person(ID)), true);
  assert.equal(await hasSession(b.req, "agent", person(OTHER)), false);
  assert.equal(await hasSession(b.req, "agent", { _id: ID, sessionVersion: "changed" }), false);
  await signOut(b.req, b.res, "agent");
  assert.deepEqual(b.cookies, {});
  assert.deepEqual(await active(ID), []);
});

test("signing in again on the same browser replaces its session; signing out ends both areas of one person", async (t) => {
  setup(t);
  const b = browser();
  const first = await startSession(b.req, b.res, person(ID), "customer");
  const second = await startSession(b.req, b.res, person(ID), "customer");
  assert.deepEqual(await active(ID), [String(second._id)], "not two");
  assert.notEqual(String(first._id), String(second._id));
  const agent = await startSession(b.req, b.res, person(ID), "agent", { startedWith: "customer" });
  assert.deepEqual(browserSessionIds(b.req, person(ID)).sort(), [String(second._id), String(agent._id)].sort());
  assert.equal((await listSessions(b.req, person(ID))).every((entry) => entry.current), true);
  await signOut(b.req, b.res, "customer");
  assert.deepEqual([await active(ID), b.cookies], [[], {}]);

  // Another person's agent account on this browser stays
  await startSession(b.req, b.res, person(ID), "customer");
  const theirs = await startSession(b.req, b.res, person(OTHER), "agent");
  await signOut(b.req, b.res, "customer");
  assert.deepEqual(await active(OTHER), [String(theirs._id)]);
  assert.deepEqual(Object.keys(b.cookies), ["agent_token"]);
  await endSessions(OTHER, "admin");
});

test("a person keeps a limited number of sessions, and ending works for one, the others or all", async (t) => {
  setup(t);
  const browsers = [];
  for (let i = 0; i < MAX_SESSIONS + 2; i++) { const b = browser(); await startSession(b.req, b.res, person(ID), "agent"); browsers.push(b); }
  assert.equal((await active(ID)).length, MAX_SESSIONS);
  const last = browsers.at(-1);
  assert.equal(await hasSession(last.req, "agent", person(ID)), true, "never the newest");
  const mine = browserSessionIds(last.req, person(ID));
  const [one] = (await active(ID)).filter((id) => !mine.includes(id));
  assert.equal(await endSessions(OTHER, "signed_out_elsewhere", { id: one }), 0, "nobody else can end it");
  assert.equal(await endSessions(ID, "signed_out_elsewhere", { id: one }), 1);
  assert.equal(await endSessions(ID, "signed_out_elsewhere", { except: mine }), MAX_SESSIONS - 2);
  assert.deepEqual(await active(ID), mine);
  assert.equal(await endSessions(ID, "admin"), 1);
  assert.equal(await hasSession(last.req, "agent", person(ID)), false, "its cookie opens nothing any more");
});

test("cookies that are forged, for another area, or without a session hold nothing", async (t) => {
  setup(t);
  const sign = (claims, key = KEY) => ({ cookies: { agent_token: jwt.sign(claims, key, { expiresIn: "1h" }) } });
  const good = { id: ID, sid: OTHER, session: "agent" };
  assert.deepEqual(browserSessionIds(sign(good), person(ID)), [OTHER]);
  for (const req of [sign(good, "another-key"), sign({ ...good, session: "customer" }), sign({ id: ID, session: "agent" }), sign({ ...good, sid: "x" }), { cookies: {} }, {}]) assert.deepEqual(browserSessionIds(req, person(ID)), []);
});
