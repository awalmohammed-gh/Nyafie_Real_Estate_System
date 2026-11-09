import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import Notification from "../models/Notification.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import SavedSearch from "../models/SavedSearch.js";
import { alertSavedSearches } from "../utils/savedSearches.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("saved searches: customers save searches and hear about new matching homes once", { skip: process.env.RUN_SAVED_SEARCH_INTEGRATION !== "1", timeout: 90000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-saved-search-signing-key-32-characters";
  process.env.PUBLIC_SITE_URL = "https://nyafie.example";
  for (const key of ["SMTP_USER", "SMTP_APP_PASSWORD"]) { const saved = process.env[key]; t.after(() => { if (saved === undefined) delete process.env[key]; else process.env[key] = saved; }); }
  Object.assign(process.env, { SMTP_USER: "sender@gmail.com", SMTP_APP_PASSWORD: "test-app-password" });
  const emails = [];
  t.mock.method(nodemailer, "createTransport", () => ({ sendMail: async (mail) => { emails.push(mail); return { accepted: [mail.to] }; } }));

  await Setting.create({ key: "platform", agent: { requireSubscription: false }, property: { requireApproval: false, allowAgentPublishing: true, maxImages: 15, propertyTypes: ["Apartment", "House"], rentPeriods: ["month", "night"] } });
  const admin = await User.create({ emailVerifiedAt: new Date(), firstName: "Site", lastName: "Admin", email: "admin@search.test", password: "test-password", role: "admin" });
  const [amina, kofi] = await User.create([1, 2].map((n) => ({ emailVerifiedAt: new Date(), firstName: `Customer${n}`, lastName: "Test", email: `customer${n}@search.test`, phone: "0241234567", password: "test-password" })));
  const agent = await User.create({ emailVerifiedAt: new Date(), firstName: "Listing", lastName: "Agent", email: "agent@search.test", phone: "0241234567", password: "test-password", role: "agent", agentApplication: { status: "approved" } });
  const plan = await Plan.create({ name: "Search Test", price: 0, duration: 365, propertyLimit: 20, imageLimit: 15 });
  agent.subscription = (await Subscription.create({ user: agent._id, plan: plan._id, planName: plan.name, amount: 0, paymentReference: "test-search-agent", status: "active", paymentStatus: "waived", expiresAt: new Date("2035-01-01") }))._id;
  await agent.save();

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const api = async (path, { user, body, method = body ? "POST" : "GET" } = {}) => {
    const session = user?.role === "agent" ? "agent" : "customer";
    const headers = { "Content-Type": "application/json", ...(user ? { ...customerTabHeaders(session), "X-Session-Domain": session, Cookie: `${session}_token=${jwt.sign({ id: user.id, role: user.role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" })}` } : { "X-Session-Domain": "customer" }) };
    const response = await fetch(`${base}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { code: response.status, ...(await response.json()) };
  };
  const alertsFor = (user) => Notification.find({ recipient: user._id, type: "search_alert" }).lean();
  const listing = (fields = {}) => Property.create({ title: "Two bed flat", description: "A bright two bedroom flat close to shops and schools in the area.", propertyType: "Apartment", listingType: "Rent", price: 2500, pricePeriod: "month", bedrooms: 2, bathrooms: 2, area: 90, images: ["/hero/modern-living.jpg"], location: { neighbourhood: "East Legon", city: "Accra", address: "1 Test Road", latitude: 5.6355, longitude: -0.1617 }, owner: admin._id, ownerType: "admin", status: "published", availability: "Available", ...fields });
  const rentInLegon = { listingType: "Rent", area: "East Legon", maxPrice: 3000, bedrooms: 2 };

  await t.test("customers save, rename, switch email off and delete only their own searches", async () => {
    assert.equal((await api("/saved-searches", { body: { filters: rentInLegon } })).code, 401, "guests sign in first");
    const created = await api("/saved-searches", { user: amina, body: { filters: rentInLegon } });
    assert.equal(created.code, 201, JSON.stringify(created));
    assert.equal(created.data.name, "2+ bed homes to rent in East Legon, up to ₵3,000");
    assert.equal(created.data.emailAlerts, true);
    assert.equal(created.data.alertedIds, undefined, "alert bookkeeping is never sent");
    assert.equal((await api("/saved-searches", { user: amina, body: { filters: rentInLegon } })).code, 409, "no duplicates");
    assert.equal((await api("/saved-searches", { user: amina, body: { filters: {} } })).code, 400, "at least one filter");
    assert.equal((await api("/saved-searches", { user: amina, body: { filters: { minPrice: 5000, maxPrice: 100 } } })).code, 400);
    assert.equal((await api("/saved-searches", { user: kofi })).data.length, 0, "another customer sees none of them");
    assert.equal((await api(`/saved-searches/${created.data.id}`, { user: kofi, method: "PATCH", body: { name: "Mine now" } })).code, 404);
    const renamed = await api(`/saved-searches/${created.data.id}`, { user: amina, method: "PATCH", body: { name: "Legon flats", emailAlerts: false } });
    assert.equal(renamed.data.name, "Legon flats");
    assert.equal(renamed.data.emailAlerts, false);
    assert.equal((await api(`/saved-searches/${created.data.id}`, { user: kofi, method: "DELETE" })).code, 404);
    assert.equal((await api(`/saved-searches/${created.data.id}`, { user: amina, method: "DELETE" })).code, 200);
    assert.equal((await api("/saved-searches", { user: amina })).data.length, 0);
  });

  await t.test("a newly published matching home alerts the customer once, in the app and by email", async () => {
    await api("/saved-searches", { user: amina, body: { filters: rentInLegon, name: "Legon flats" } });
    // Published by an agent through the normal listing endpoint
    const published = await api("/properties", { user: agent, body: { title: "Garden flat", description: "A calm two bedroom flat with a garden, parking and a borehole.", propertyType: "Apartment", listingType: "Rent", pricePeriod: "month", price: 2800, bedrooms: 2, bathrooms: 2, area: 95, images: ["/hero/modern-living.jpg"], location: { neighbourhood: "East Legon", city: "Accra", address: "4 Garden Road", latitude: 5.636, longitude: -0.162 }, moveIn: { advanceMonths: 12, agentFeeType: "percent", agentFeeValue: 10, securityDeposit: 2800 } } });
    assert.equal(published.code, 201, JSON.stringify(published));
    assert.deepEqual(published.data.moveIn, { advanceMonths: 12, agentFeeType: "percent", agentFeeValue: 10, securityDeposit: 2800 }, "move-in costs are stored with the listing");
    const alerts = await alertsFor(amina);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].link, `/house/${published.data.id}`);
    assert.match(alerts[0].message, /Garden flat · ₵2,800\/month · East Legon, Accra — “Legon flats”/);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].to, "customer1@search.test");
    assert.match(emails[0].html, /https:\/\/nyafie\.example\/house\//);
    // Publishing it again (or a retry) does not repeat the alert
    await alertSavedSearches(await Property.findById(published.data.id));
    assert.equal((await alertsFor(amina)).length, 1);
    assert.equal((await alertsFor(kofi)).length, 0, "only the customer whose search matched");
  });

  await t.test("homes that don't match, aren't open, or belong to the searcher are not announced", async () => {
    const before = (await alertsFor(amina)).length;
    for (const fields of [{ price: 9000 }, { location: { neighbourhood: "Osu", city: "Accra", address: "2 Road" } }, { bedrooms: 1 }, { listingType: "Sale", pricePeriod: "total" }, { availability: "Rented" }, { status: "draft" }, { owner: amina._id }]) {
      await alertSavedSearches(await listing(fields));
    }
    assert.equal((await alertsFor(amina)).length, before);
  });

  await t.test("searches near a place match homes within the radius only", async () => {
    await api("/saved-searches", { user: kofi, body: { filters: { listingType: "Rent", near: { latitude: 5.6037, longitude: -0.187, radius: 5, label: "Accra Central" } } } });
    await alertSavedSearches(await listing({ title: "Near flat", location: { neighbourhood: "Adabraka", city: "Accra", address: "Ring Road", latitude: 5.58, longitude: -0.195 } }));
    await alertSavedSearches(await listing({ title: "Far flat", location: { neighbourhood: "Tema", city: "Tema", address: "Harbour Road", latitude: 5.67, longitude: 0.0 } }));
    const alerts = await alertsFor(kofi);
    assert.deepEqual(alerts.map((alert) => alert.message.split(" · ")[0]), ["Near flat"]);
  });

  await t.test("customers who switched saved search alerts off are not notified", async () => {
    await User.updateOne({ _id: kofi._id }, { $set: { preferences: { searchAlerts: false } } });
    const before = (await alertsFor(kofi)).length, mails = emails.length;
    await alertSavedSearches(await listing({ title: "Another near flat", location: { neighbourhood: "Asylum Down", city: "Accra", address: "Down Road", latitude: 5.585, longitude: -0.2 } }));
    assert.equal((await alertsFor(kofi)).length, before);
    assert.equal(emails.length, mails);
    assert.equal((await SavedSearch.find({ user: kofi._id }).lean())[0].alertedIds.length, 2, "the match is still recorded, so switching back on doesn't flood them");
  });
});
