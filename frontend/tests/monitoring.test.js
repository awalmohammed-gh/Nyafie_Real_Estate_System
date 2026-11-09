import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanUrl, scrubBreadcrumb, scrubEvent } from "../src/utils/monitoring.js";

test("browser error reports never carry the admin address, tokens, query strings or personal data", () => {
  const entry = "hb-private-admin-entry-123";
  assert.equal(cleanUrl("https://nyafie.example/hb-private-admin-entry-123/payments?tab=refunds", entry), "https://nyafie.example/:admin/payments");
  assert.equal(cleanUrl("/agent/join/AbCdEfGhIjKlMnOpQrStUvWx", entry), "/agent/join/:token");
  assert.equal(cleanUrl("/house/6af17c2b926409589626d02c#reviews", entry), "/house/6af17c2b926409589626d02c");
  assert.equal(cleanUrl("/payment/success?reference=HB-1", entry), "/payment/success");
  const event = scrubEvent({ request: { url: "https://nyafie.example/account/rentals?x=1", headers: { Referer: "https://nyafie.example/secret" } }, user: { id: "u1", email: "a@b.c", ip_address: "{{auto}}" }, breadcrumbs: [{ category: "navigation", data: { from: "/agent/join/AbCdEfGhIjKlMnOpQrStUvWx", to: "/" } }] });
  assert.deepEqual(event.request, { url: "https://nyafie.example/account/rentals" });
  assert.deepEqual(event.user, { id: "u1" });
  assert.equal(event.breadcrumbs[0].data.from, "/agent/join/:token");
  assert.equal(scrubBreadcrumb({ category: "console", message: "token=abc" }), null);
  assert.equal(scrubBreadcrumb({ category: "ui.click" }).category, "ui.click");
});
