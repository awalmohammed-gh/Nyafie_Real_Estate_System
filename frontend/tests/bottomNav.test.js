import { test } from "node:test";
import assert from "node:assert/strict";
import { bottomNavAllowedOn, bottomNavTab } from "../src/utils/bottomNav.js";

const paths = { listings: "/listings", properties: "/properties", agents: "/agents" };

test("the phone tab bar stays off pages with their own bottom action bar and the agent area", () => {
  for (const path of ["/", "/listings", "/sale", "/rent", "/about", "/account/saved", "/account/messages", "/compare", "/agents/abc"]) assert.equal(bottomNavAllowedOn(path), true, path);
  for (const path of ["/house/abc", "/checkout/rent/1", "/checkout/buy/1", "/payment/success", "/make-offer/1", "/agent/plans", "/agent/join/token"]) assert.equal(bottomNavAllowedOn(path), false, path);
  assert.equal(bottomNavAllowedOn("/housing-guide"), true, "only whole path segments count");
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
