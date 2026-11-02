import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { createApp } from "../app.js";
import { protectAdmin } from "../middleware/authMiddleware.js";
import { adminEntryPath, adminEntryProblem } from "../utils/adminEntry.js";

const ENTRY = "hb-console-Test4Entry9";
// The frontend build embeds only this hash (vite.config.js); set it before the helpers load
globalThis.__ADMIN_ENTRY_HASH__ = crypto.createHash("sha256").update(ENTRY).digest("hex");
const frontend = await import("../../frontend/src/utils/adminEntry.js");
const sessions = await import("../../frontend/src/utils/sessionDomain.js");

const KEYS = ["ADMIN_ENTRY_PATH", "NODE_ENV"];
const configure = (t, values) => {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, values);
  t.after(() => { for (const key of KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
};

test("the browser only recognises the console at its private address", async () => {
  assert.equal(frontend.adminEntry(), null);
  for (const guess of ["/admin", "/admin/login", "/amin", "/hb-console", "/HB-CONSOLE-TEST4ENTRY9"]) {
    await frontend.resolveAdminEntry(guess);
    assert.equal(frontend.adminEntry(), null, `${guess} is not the console`);
    assert.equal(sessions.sessionDomainForPath(guess), "customer", `${guess} is an ordinary page`);
  }
  await frontend.resolveAdminEntry(`/${ENTRY}/login`);
  assert.equal(frontend.adminEntry(), ENTRY);
  assert.equal(sessions.sessionDomainForPath(`/${ENTRY}/dashboard`), "admin");
  assert.equal(sessions.sessionDomainForPath(`/${ENTRY}x/dashboard`), "customer");
  assert.equal(sessions.sessionDomainForPath("/admin/dashboard"), "customer", "/admin never becomes the console");
  assert.equal(sessions.sessionLogin.admin, `/${ENTRY}/login`);
  assert.equal(sessions.sessionDestination("admin", `/${ENTRY}/settings?tab=account`), `/${ENTRY}/settings?tab=account`);
  assert.equal(sessions.sessionDestination("admin", "/admin/settings"), `/${ENTRY}/dashboard`);
  assert.equal(frontend.resolveAdminLink("/admin/payments"), `/${ENTRY}/payments`, "server notification links follow the private address");
  assert.equal(frontend.resolveAdminLink("/account/rentals"), "/account/rentals");
});

test("the private address must be long, unguessable and not a public page", async (t) => {
  await t.test("production without it has no admin console", (st) => {
    configure(st, { NODE_ENV: "production" });
    assert.equal(adminEntryPath(), null);
    assert.match(adminEntryProblem(), /not set/);
  });
  await t.test("development without it has no admin console either, so /admin never works", (st) => {
    configure(st, { NODE_ENV: "development" });
    assert.equal(adminEntryPath(), null);
  });
  for (const bad of ["admin", "short-entry", "has/slash-in-entry-path", "Admin".padEnd(16, "x").replace("x", " ")]) {
    await t.test(`"${bad}" is refused`, (st) => {
      configure(st, { NODE_ENV: "production", ADMIN_ENTRY_PATH: bad });
      assert.equal(adminEntryPath(), null);
      assert.ok(adminEntryProblem());
    });
  }
  await t.test("a good value is used", (st) => {
    configure(st, { NODE_ENV: "production", ADMIN_ENTRY_PATH: ENTRY });
    assert.equal(adminEntryPath(), ENTRY);
  });
});

test("admin endpoints are indistinguishable from unknown ones without the private address", async (t) => {
  configure(t, { NODE_ENV: "production", ADMIN_ENTRY_PATH: ENTRY });
  let initializations = 0;
  const server = createApp({ initialize: async () => { initializations += 1; } }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = (path, headers = {}, method = "GET") => fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": "admin", ...headers }, ...(method === "POST" ? { body: JSON.stringify({ email: "admin@example.test", password: "guess" }) } : {}) });
  // The app's own answer for an unknown API path (see the 404 handler in app.js)
  const unknown = { success: false, message: "Endpoint not found." };

  for (const [path, method] of [["/auth/admin/login", "POST"], ["/auth/admin/me", "GET"], ["/admin/users", "GET"], ["/admin/payments", "GET"]]) {
    for (const headers of [{}, { "X-Admin-Entry": "admin" }, { "X-Admin-Entry": ENTRY.toUpperCase() }, { "X-Admin-Entry": `${ENTRY}x` }]) {
      const response = await call(path, headers, method);
      assert.equal(response.status, 404, `${method} ${path} with ${JSON.stringify(headers)}`);
      assert.deepEqual(await response.json(), unknown);
    }
  }
  assert.equal(initializations, 0, "rejected admin probes never reach the database");
});

test("admin-only actions outside /api/admin (plans, uploads, settings) are hidden by the session guard too", async (t) => {
  configure(t, { NODE_ENV: "production", ADMIN_ENTRY_PATH: ENTRY });
  const app = express();
  app.post("/plans", protectAdmin, (_req, res) => res.sendStatus(204));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const post = (headers) => fetch(`http://127.0.0.1:${server.address().port}/plans`, { method: "POST", headers: { "X-Session-Domain": "admin", ...headers } });
  assert.equal((await post({})).status, 404);
  assert.equal((await post({ "X-Admin-Entry": "admin" })).status, 404);
  assert.equal((await post({ "X-Admin-Entry": ENTRY })).status, 401, "with the address, normal sign-in rules apply");
});
