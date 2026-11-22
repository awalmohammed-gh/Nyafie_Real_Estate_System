import { test } from "node:test";
import assert from "node:assert/strict";
import { appManifestFor, applyAppManifest } from "../src/utils/appManifest.js";

test("the site, the agent workspace and the admin console each name their own installable app", () => {
  for (const path of ["/", "/listings", "/house/1", "/agents/abc", "/account/saved", "/agentx"]) assert.equal(appManifestFor(path), "/manifest.webmanifest", path);
  for (const path of ["/agent", "/agent/dashboard", "/agent/login", "/agent/properties/1"]) assert.equal(appManifestFor(path), "/agent.webmanifest", path);
  // Without the console's private address in this tab, nothing is ever an admin page (no admin app)
  assert.equal(appManifestFor("/admin/dashboard"), "/manifest.webmanifest");
});

test("moving to another area points the browser at that app and drops the earlier install offer", () => {
  const link = { href: "/manifest.webmanifest", getAttribute() { return this.href; }, setAttribute(_name, value) { this.href = value; } };
  const doc = { querySelector: () => link };
  let switches = 0;
  const onSwitch = () => { switches += 1; };
  applyAppManifest("/listings", doc, onSwitch);
  assert.equal(switches, 0, "same app: the offer is kept");
  applyAppManifest("/agent/dashboard", doc, onSwitch);
  assert.equal(link.href, "/agent.webmanifest");
  assert.equal(switches, 1);
  applyAppManifest("/agent/messages", doc, onSwitch);
  assert.equal(switches, 1, "still the agent app");
  applyAppManifest("/", doc, onSwitch);
  assert.equal(link.href, "/manifest.webmanifest");
  assert.equal(switches, 2);
});
