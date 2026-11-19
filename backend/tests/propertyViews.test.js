import { test } from "node:test";
import assert from "node:assert/strict";
import User from "../models/User.js";
import Property from "../models/Property.js";
import PropertyView from "../models/PropertyView.js";
import Setting from "../models/Setting.js";
import { recordView } from "../controllers/propertyController.js";
import { isCrawler } from "../utils/propertyViews.js";
import { fakeListedAgents } from "./support/listedAgents.js";
import PropertyViewDay from "../models/PropertyViewDay.js";

const query = (value) => ({
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  catch: (reject) => Promise.resolve(value).catch(reject),
  select: () => query(value), sort: () => query(value), populate: () => query(value), lean: () => Promise.resolve(value),
});
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const person = (fields) => new User({ emailVerifiedAt: new Date(), firstName: "Test", lastName: "Person", phone: "+233200000000", email: `${Math.random()}@example.test`, password: "password123", ...fields });
const admin = person({ role: "admin" });
const company = person({ role: "agent", isActive: true, agentApplication: { status: "approved", agentType: "company" } });
const staff = person({ role: "agent", isActive: true, agentApplication: { status: "approved" }, agency: { owner: company._id, role: "agent" } });
const otherAgent = person({ role: "agent", isActive: true, agentApplication: { status: "approved" } });
const customer = person({ role: "user" });
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

/**
 * In-memory stand-ins for the mongoose calls recordView makes. Listings are company-owned agent
 * listings unless overridden; `listed` decides whether the owner passes the public directory rules.
 */
const setup = (t, { listed = true } = {}) => {
  const listings = new Map();
  const windows = new Map(); // `${property}:${viewer}` -> viewedAt
  const stored = [];
  const incOptions = [];
  const daily = new Map(); // property -> views counted today (the owner's insights chart)
  t.mock.method(Setting, "findOneAndUpdate", () => query({ agent: { requireSubscription: false } }));
  t.mock.method(User, "findOne", () => query(listed ? company : null));
  t.mock.method(User, "aggregate", fakeListedAgents(() => (listed ? [company] : [])));
  t.mock.method(Property, "findById", (id) => query(listings.get(String(id)) || null));
  t.mock.method(Property, "findByIdAndUpdate", async (id, update, options) => {
    incOptions.push(options);
    const property = listings.get(String(id));
    property.views += update.$inc.views;
    return { views: property.views };
  });
  t.mock.method(PropertyViewDay, "updateOne", async (filter, update) => {
    daily.set(String(filter.property), (daily.get(String(filter.property)) || 0) + update.$inc.count);
    return { acknowledged: true };
  });
  t.mock.method(PropertyView, "updateOne", async (filter, update) => {
    const key = `${filter.property}:${filter.viewer}`;
    if (update.$setOnInsert) {
      if (windows.has(key)) return { upsertedCount: 0, modifiedCount: 0 };
      windows.set(key, update.$setOnInsert.viewedAt);
      stored.push({ ...filter, ...update.$setOnInsert });
      return { upsertedCount: 1, modifiedCount: 0 };
    }
    if (windows.get(key) <= filter.viewedAt.$lte) { windows.set(key, update.$set.viewedAt); return { modifiedCount: 1 }; }
    return { modifiedCount: 0 };
  });
  const listing = (extra = {}) => {
    const property = new Property({ title: "East Legon Apartment", propertyType: "Apartment", listingType: "Rent", price: 4500, owner: company._id, ownerType: "agent", status: "published", views: 0, ...extra });
    listings.set(String(property._id), property);
    return property;
  };
  return { listing, windows, stored, incOptions, daily };
};

const view = async (property, { ip = "41.66.10.20", ua = CHROME, body = {}, sessions = {} } = {}) => {
  const res = response();
  await recordView({ params: { id: String(property?._id ?? property) }, body, ip, get: (name) => (name.toLowerCase() === "user-agent" ? ua : undefined), viewerSessions: sessions }, res);
  return res;
};
const data = (res) => res.body.data;

test("an anonymous visitor counts once per listing; refreshes don't count; another listing counts on its own", async (t) => {
  const { listing, incOptions, daily } = setup(t);
  const a = listing();
  const b = listing({ title: "Airport Residential House" });
  assert.deepEqual(data(await view(a)), { counted: true, views: 1 });
  assert.deepEqual(data(await view(a)), { counted: false, views: 1 });
  assert.deepEqual(data(await view(a)), { counted: false, views: 1 });
  assert.deepEqual(data(await view(b)), { counted: true, views: 1 });
  assert.equal(a.views, 1);
  assert.equal(incOptions[0].timestamps, false); // a view never changes the listing's updatedAt
  await new Promise((resolve) => setImmediate(resolve)); // the daily count is recorded without holding up the answer
  assert.equal(daily.get(String(a._id)), 1, "only counted views reach the owner's daily chart");
  assert.equal(daily.get(String(b._id)), 1);
});

test("a visitor counts again only after the window has passed", async (t) => {
  const { listing, windows } = setup(t);
  const a = listing();
  await view(a);
  for (const key of windows.keys()) windows.set(key, new Date(Date.now() - 23 * 60 * 60 * 1000));
  assert.equal(data(await view(a)).counted, false);
  for (const key of windows.keys()) windows.set(key, new Date(Date.now() - 25 * 60 * 60 * 1000));
  assert.deepEqual(data(await view(a)), { counted: true, views: 2 });
});

test("different people on a shared IP count separately, and signed-in customers count once per account", async (t) => {
  const { listing } = setup(t);
  const a = listing();
  assert.equal(data(await view(a, { ua: CHROME })).counted, true);
  assert.equal(data(await view(a, { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1" })).counted, true);
  assert.equal(data(await view(a, { sessions: { customer }, ip: "10.0.0.1" })).counted, true);
  assert.equal(data(await view(a, { sessions: { customer }, ip: "10.0.0.2", ua: "Firefox/131.0" })).counted, false); // same account, new network
  assert.equal(a.views, 3);
});

test("the owner organisation's staff and NyaFie admins never add views; other agents do", async (t) => {
  const { listing } = setup(t);
  const a = listing();
  for (const sessions of [{ agent: company }, { agent: staff }, { customer: company }, { customer: staff }, { admin }, { customer, admin }]) {
    assert.deepEqual(data(await view(a, { sessions })), { counted: false, views: 0 });
  }
  assert.equal(data(await view(a, { sessions: { agent: otherAgent } })).counted, true);
  const nyafie = listing({ ownerType: "admin", owner: admin._id });
  assert.equal(data(await view(nyafie, { sessions: { admin } })).counted, false);
  assert.equal(data(await view(nyafie)).counted, true);
});

test("the browser cannot set the count or claim an identity", async (t) => {
  const { listing, stored } = setup(t);
  const a = listing({ views: 7 });
  const res = await view(a, { body: { views: 999999, viewCount: 999999, userId: String(customer._id), counted: true } });
  assert.deepEqual(data(res), { counted: true, views: 8 });
  // The stored viewer is a keyed hash: no raw IP, and nothing about it goes back to the browser
  assert.equal(stored[0].viewer.includes("41.66"), false);
  assert.match(stored[0].viewer, /^[\w-]{43}$/);
  assert.deepEqual(Object.keys(data(res)).sort(), ["counted", "views"]);
});

test("crawlers, link previews and scripts are not counted", async (t) => {
  const { listing } = setup(t);
  const a = listing();
  for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "facebookexternalhit/1.1", "WhatsApp/2.23.20", "curl/8.4.0", "Mozilla/5.0 HeadlessChrome/120.0", ""]) {
    assert.equal(data(await view(a, { ua })).counted, false, ua);
  }
  assert.equal(a.views, 0);
  assert.equal(isCrawler(CHROME), false);
});

test("missing, invalid, draft, hidden and unlisted-provider listings are not counted", async (t) => {
  const { listing } = setup(t);
  assert.equal((await view("not-an-id")).code, 404);
  assert.equal((await view("66f1a2b3c4d5e6f7a8b9c0d1")).code, 404);
  for (const status of ["draft", "pending", "rejected", "suspended"]) {
    const property = listing({ status });
    assert.equal((await view(property)).code, 404, status);
    assert.equal(property.views, 0);
  }
  // Sold and rented listings stay public, so their views still count
  assert.equal(data(await view(listing({ availability: "Rented" }))).counted, true);
});

test("a listing whose provider is not publicly listed is not counted", async (t) => {
  const { listing } = setup(t, { listed: false });
  const a = listing();
  assert.equal((await view(a)).code, 404);
  assert.equal(a.views, 0);
});

test("simultaneous requests from one visitor count once", async (t) => {
  const { listing } = setup(t);
  const a = listing();
  const results = await Promise.all([view(a), view(a), view(a)]);
  assert.equal(results.filter((res) => data(res).counted).length, 1);
  assert.equal(a.views, 1);

  // The database's unique index rejecting the losing insert is treated as "already counted"
  PropertyView.updateOne.mock.mockImplementation(async () => { throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 }); });
  assert.deepEqual(data(await view(a, { ua: "Firefox/131.0" })), { counted: false, views: 1 });
});

test("a tracking failure still answers normally, so the page is unaffected", async (t) => {
  const { listing } = setup(t);
  const a = listing({ views: 5 });
  const error = t.mock.method(console, "error", () => {});
  PropertyView.updateOne.mock.mockImplementation(async () => { throw new Error("connection reset"); });
  const res = await view(a);
  assert.equal(res.code, 200);
  assert.deepEqual(data(res), { counted: false, views: 5 });
  assert.equal(error.mock.callCount(), 1);
});
