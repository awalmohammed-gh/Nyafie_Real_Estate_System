import { test } from "node:test";
import assert from "node:assert/strict";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { notifyUser, notifyOwner } from "../utils/notify.js";

const fixture = (t, account) => {
  const created = [];
  const refreshed = [];
  const lookup = t.mock.method(User, "findById", () => ({ select: () => ({ lean: async () => account }) }));
  t.mock.method(Notification, "create", async (doc) => { created.push(doc); });
  t.mock.method(Notification, "findOneAndUpdate", async (...args) => { refreshed.push(args); });
  return { created, refreshed, lookup };
};

test("customer preferences suppress conversation and offer notifications, including grouped messages", async (t) => {
  const { created, refreshed } = fixture(t, { role: "user", preferences: { inquiryUpdates: false, offerUpdates: false } });
  await notifyUser("customer", { type: "message", title: "Reply", key: "conversation:1" });
  await notifyUser("customer", { type: "offer", title: "Offer accepted" });
  assert.equal(created.length, 0);
  assert.equal(refreshed.length, 0);
});

test("new customers receive optional notifications by default and explicit enabled preferences work", async (t) => {
  const account = { role: "user", preferences: {} };
  const { created, refreshed } = fixture(t, account);
  await notifyUser("customer", { type: "offer", title: "Offer submitted" });
  account.preferences.inquiryUpdates = true;
  await notifyUser("customer", { type: "message", title: "Reply", key: "conversation:1" });
  assert.equal(created.length, 1);
  assert.equal(created[0].recipient, "customer");
  assert.equal(created[0].audience, "user");
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0][0].key, "conversation:1");
});

test("essential transaction notifications remain enabled regardless of optional preferences", async (t) => {
  const { created, lookup } = fixture(t, { role: "user", preferences: { inquiryUpdates: false, offerUpdates: false } });
  for (const type of ["rental", "sale", "payment", "status"]) await notifyUser("customer", { type, title: "Essential update" });
  assert.equal(created.length, 4);
  assert.equal(lookup.mock.callCount(), 0);
});

test("customer switches do not suppress agent owner notifications", async (t) => {
  const { created } = fixture(t, { role: "agent", preferences: { inquiryUpdates: false, offerUpdates: false } });
  await notifyOwner({ owner: "agent", ownerType: "agent" }, { type: "offer", title: "New offer", path: "offers" });
  assert.equal(created.length, 1);
  assert.equal(created[0].link, "/agent/offers");
});

test("a preference lookup failure does not reject notification delivery", async (t) => {
  const { created } = fixture(t, null);
  t.mock.method(User, "findById", () => { throw new Error("Temporary database error"); });
  const logged = t.mock.method(console, "error", () => {});
  await notifyUser("customer", { type: "offer", title: "Offer accepted" });
  assert.equal(created.length, 1);
  assert.equal(logged.mock.callCount(), 1);
});
