import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPath, initMonitoring, monitoringEnabled, reportError, scrubEvent } from "../utils/monitoring.js";

test("monitoring is off without SENTRY_DSN, and reporting is then a harmless no-op", async () => {
  const previous = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  try {
    assert.equal(initMonitoring(), false);
    assert.equal(monitoringEnabled(), false);
    await reportError(new Error("not sent"));
  } finally { if (previous !== undefined) process.env.SENTRY_DSN = previous; }
});

test("error reports never carry secrets or personal data", () => {
  const previous = process.env.ADMIN_ENTRY_PATH;
  process.env.ADMIN_ENTRY_PATH = "hb-private-admin-entry-123";
  try {
    assert.equal(cleanPath("/api/team/invites/AbCdEfGhIjKlMnOpQrStUvWx/accept?x=1"), "/api/team/invites/:token/accept", "invite tokens and query strings removed");
    assert.equal(cleanPath("/payment/success?reference=HB-123"), "/payment/success");
    assert.equal(cleanPath("/hb-private-admin-entry-123/login"), "/:admin/login", "the admin console's private address");
    assert.equal(cleanPath("/api/properties/6af17c2b926409589626d02c"), "/api/properties/6af17c2b926409589626d02c", "record ids are kept");
    const event = scrubEvent({
      request: { method: "POST", url: "https://site.example/api/auth/login?next=/x", headers: { cookie: "customer_token=secret", authorization: "Bearer x" }, data: { password: "hunter2" }, cookies: { a: "b" } },
      user: { id: "u1", email: "person@example.com", ip_address: "1.2.3.4" },
      server_name: "lambda-host",
      breadcrumbs: [{ category: "http", data: { url: "/api/team/invites/AbCdEfGhIjKlMnOpQrStUvWx", method: "GET", status_code: 500, body: "x" } }],
    });
    assert.deepEqual(event.request, { method: "POST", url: "https:/" + "/site.example/api/auth/login".replace("https://", "") });
    const text = JSON.stringify(event);
    for (const secret of ["customer_token", "Bearer", "hunter2", "person@example.com", "1.2.3.4", "lambda-host", "AbCdEfGhIjKlMnOpQrStUvWx", "body"]) assert.equal(text.includes(secret), false, secret);
    assert.deepEqual(event.user, { id: "u1" });
  } finally { if (previous === undefined) delete process.env.ADMIN_ENTRY_PATH; else process.env.ADMIN_ENTRY_PATH = previous; }
});
