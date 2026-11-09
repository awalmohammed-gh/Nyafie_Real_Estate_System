import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import Notification from "../models/Notification.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import { checkListingFreshness, GRACE_DAYS, REMIND_AFTER_DAYS } from "../utils/listingFreshness.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

const DAY = 24 * 60 * 60 * 1000;

test("listing freshness: owners confirm listings are still available, or they are hidden from search", { skip: process.env.RUN_FRESHNESS_INTEGRATION !== "1", timeout: 90000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-freshness-signing-key-32-characters!";
  await Setting.create({ key: "platform", agent: { requireSubscription: false }, property: { requireApproval: false, allowAgentPublishing: true, propertyTypes: ["Apartment", "Hotel"], rentPeriods: ["month", "night"] } });
  const admin = await User.create({ emailVerifiedAt: new Date(), firstName: "Site", lastName: "Admin", email: "admin@fresh.test", password: "test-password", role: "admin" });
  const agent = await User.create({ emailVerifiedAt: new Date(), firstName: "Listing", lastName: "Agent", email: "agent@fresh.test", phone: "0241234567", password: "test-password", role: "agent", agentApplication: { status: "approved" } });
  const plan = await Plan.create({ name: "Fresh Test", price: 0, duration: 365, propertyLimit: 20, imageLimit: 15 });
  agent.subscription = (await Subscription.create({ user: agent._id, plan: plan._id, planName: plan.name, amount: 0, paymentReference: "test-fresh-agent", status: "active", paymentStatus: "waived", expiresAt: new Date("2035-01-01") }))._id;
  await agent.save();

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { user, body, method = body ? "POST" : "GET" } = {}) => {
    const session = user?.role === "agent" ? "agent" : user?.role === "admin" ? "admin" : "customer";
    const headers = { "Content-Type": "application/json", "X-Session-Domain": session, ...(user ? { ...customerTabHeaders(session), Cookie: `${session}_token=${jwt.sign({ id: user.id, role: user.role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" })}` } : {}) };
    const response = await fetch(`${base}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    try { return { code: response.status, ...JSON.parse(text) }; } catch { return { code: response.status, text }; }
  };

  const now = new Date();
  const ago = (days) => new Date(now.getTime() - days * DAY);
  const listing = async (title, fields = {}, { updatedAt } = {}) => {
    const doc = await Property.create({ title, description: "A well kept home in a quiet street, close to schools and shops.", propertyType: "Apartment", listingType: "Rent", price: 2500, pricePeriod: "month", bedrooms: 2, bathrooms: 1, area: 80, images: ["/hero/modern-living.jpg"], location: { neighbourhood: "Osu", city: "Accra", address: "1 Fresh Road" }, owner: agent._id, ownerType: "agent", status: "published", availability: "Available", ...fields });
    if (updatedAt) await Property.collection.updateOne({ _id: doc._id }, { $set: { updatedAt } }); // as if last edited long ago
    return doc;
  };
  const fresh = await listing("Fresh flat", { availabilityConfirmedAt: ago(3) });
  const old = await listing("Old flat", { availabilityConfirmedAt: ago(REMIND_AFTER_DAYS + 1) });
  const legacy = await listing("Legacy flat", {}, { updatedAt: ago(45) }); // saved before freshness existed
  await listing("Old hotel", { propertyType: "Hotel", pricePeriod: "night", availabilityConfirmedAt: ago(90) });
  await listing("Rented flat", { availability: "Rented", availabilityConfirmedAt: ago(90) });
  const platform = await listing("Platform flat", { owner: admin._id, ownerType: "admin", availabilityConfirmedAt: ago(60) });
  const titles = async (path) => (await call(path)).data.items.map((item) => item.title).sort();

  await t.test("owners are asked once about listings not confirmed for 30 days (not hotels, not rented homes)", async () => {
    const editedBefore = (await Property.findById(old._id)).updatedAt.getTime();
    assert.deepEqual(await checkListingFreshness(now), { reminded: 3, hidden: 0 });
    const reminded = (await Property.find({ freshnessReminderAt: { $ne: null } }).lean()).map((p) => p.title).sort();
    assert.deepEqual(reminded, ["Legacy flat", "Old flat", "Platform flat"]);
    assert.equal(await Notification.countDocuments({ recipient: agent._id, title: "Is your listing still available?" }), 2);
    assert.equal(await Notification.countDocuments({ audience: "admins", title: "Is your listing still available?" }), 1, "the platform's own listings ask the admin team");
    assert.equal((await Notification.findOne({ recipient: agent._id })).link, "/agent/properties");
    assert.deepEqual(await checkListingFreshness(now), { reminded: 0, hidden: 0 }, "never asked twice");
    assert.equal((await Property.findById(old._id)).updatedAt.getTime(), editedBefore, "a reminder is not an edit");
  });

  await t.test("listings still unconfirmed after the grace period are hidden from the public, not deleted", async () => {
    const later = new Date(now.getTime() + (GRACE_DAYS + 1) * DAY);
    assert.deepEqual(await checkListingFreshness(later), { reminded: 0, hidden: 3 });
    assert.ok((await Property.findById(old._id)).staleSince);
    assert.deepEqual(await titles("/api/properties?page=1"), ["Fresh flat", "Old hotel", "Rented flat"], "search drops the unconfirmed listings (rented ones stay public, as before)");
    assert.equal((await call(`/api/properties/${old.id}`)).code, 404, "hidden from the public details page");
    assert.equal((await call(`/api/properties/${old.id}`, { user: agent })).code, 200, "the owner still sees it");
    assert.equal((await call("/sitemap-properties-1.xml")).text.includes(old.id), false);
    assert.equal(await Notification.countDocuments({ recipient: agent._id, title: "Listing hidden until you confirm it" }), 2);
  });

  await t.test("confirming a listing shows it again; only its owner (or an admin) can confirm it", async () => {
    const other = await User.create({ emailVerifiedAt: new Date(), firstName: "Other", lastName: "Agent", email: "other@fresh.test", password: "test-password", role: "agent", agentApplication: { status: "approved" } });
    assert.equal((await call(`/api/properties/${old.id}/confirm-availability`, { user: other, method: "PATCH" })).code, 403);
    const confirmed = await call(`/api/properties/${old.id}/confirm-availability`, { user: agent, method: "PATCH" });
    assert.equal(confirmed.code, 200, JSON.stringify(confirmed));
    assert.equal(confirmed.message, "Listing confirmed and shown again");
    const saved = await Property.findById(old._id);
    assert.equal(saved.staleSince, null);
    assert.equal(saved.freshnessReminderAt, null);
    assert.ok(saved.availabilityConfirmedAt > ago(1));
    assert.equal((await call(`/api/admin/properties/${platform.id}/confirm-availability`, { user: admin, method: "PATCH" })).code, 200);
    assert.deepEqual(await titles("/api/properties?page=1"), ["Fresh flat", "Old flat", "Old hotel", "Platform flat", "Rented flat"]);
  });

  await t.test("editing a hidden listing also confirms it", async () => {
    const edited = await call(`/api/properties/${legacy.id}`, { user: agent, method: "PUT", body: { price: 2400 } });
    assert.equal(edited.code, 200, JSON.stringify(edited));
    assert.equal((await Property.findById(legacy._id)).staleSince, null);
    assert.ok((await titles("/api/properties?page=1")).includes("Legacy flat"));
    assert.equal((await Property.findById(fresh._id)).freshnessReminderAt, null, "fresh listings were never touched");
  });
});
