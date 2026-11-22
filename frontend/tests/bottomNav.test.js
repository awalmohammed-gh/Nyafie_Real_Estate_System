import { test } from "node:test";
import assert from "node:assert/strict";
import { bottomNavAllowedOn, bottomNavTab } from "../src/utils/bottomNav.js";

const paths = { listings: "/listings", properties: "/properties", agents: "/agents" };

test("the phone tab bar is on every customer page, and off the agent area", () => {
  for (const path of ["/", "/listings", "/sale", "/rent", "/about", "/account/saved", "/account/messages", "/compare", "/agents/abc", "/house/abc", "/checkout/rent/1", "/checkout/buy/1", "/payment/success", "/make-offer/1"]) assert.equal(bottomNavAllowedOn(path), true, path);
  for (const path of ["/agent", "/agent/plans", "/agent/join/token"]) assert.equal(bottomNavAllowedOn(path), false, path);
  assert.equal(bottomNavAllowedOn("/agents"), true, "only the whole /agent segment counts");
});

test("each page highlights the tab it belongs to", () => {
  assert.equal(bottomNavTab("/", paths), "home");
  for (const path of ["/listings", "/sale", "/rent", "/properties", "/compare"]) assert.equal(bottomNavTab(path, paths), "explore", path);
  assert.equal(bottomNavTab("/account/saved", paths), "saved");
  assert.equal(bottomNavTab("/account/searches", paths), "saved");
  assert.equal(bottomNavTab("/account/messages", paths), "messages");
  for (const path of ["/account/profile", "/account/offers", "/login"]) assert.equal(bottomNavTab(path, paths), null, `${path}: the account lives in the navbar`);
  assert.equal(bottomNavTab("/about", paths), null);
  assert.equal(bottomNavTab("/listings-old", paths), null, "a slug that only starts the same is not a match");
  assert.equal(bottomNavTab("/homes", { ...paths, listings: "/homes" }), "explore", "renamed listing slugs follow Admin Settings");
});
