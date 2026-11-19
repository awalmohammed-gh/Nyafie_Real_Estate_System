import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import Offer from "../models/Offer.js";
import Inquiry from "../models/Inquiry.js";
import PropertyViewDay, { countViewToday, startOfDay } from "../models/PropertyViewDay.js";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

const DAY = 24 * 60 * 60 * 1000;

test("listing insights: daily views, saves and leads for the listing's own team", { skip: process.env.RUN_INSIGHTS_INTEGRATION !== "1", timeout: 90000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-insights-signing-key-32-characters";
  await Setting.create({ key: "platform", agent: { requireSubscription: false } });
  const user = (fields) => User.create({ emailVerifiedAt: new Date(), lastName: "Test", password: "test-password-long-enough", phone: "0241234567", ...fields });
  const agent = await user({ firstName: "Owner", email: "agent@insights.test", role: "agent", agentApplication: { status: "approved" } });
  const otherAgent = await user({ firstName: "Other", email: "other@insights.test", role: "agent", agentApplication: { status: "approved" } });
  const admin = await user({ firstName: "Site", email: "admin@insights.test", role: "admin" });
  const house = await Property.create({ title: "Popular house", description: "A house used to check listing insights.", propertyType: "House", listingType: "Sale", price: 600000, pricePeriod: "total", owner: agent._id, ownerType: "agent", status: "published", availability: "Available", views: 57 });
  // Two customers saved it
  await user({ firstName: "Saver", email: "saver1@insights.test", savedProperties: [house._id] });
  await user({ firstName: "Saver", email: "saver2@insights.test", savedProperties: [house._id] });

  // Views: 3 today, 2 five days ago, 4 twenty days ago (outside 14 days, inside 30)
  for (let i = 0; i < 3; i++) await countViewToday(house._id);
  for (let i = 0; i < 2; i++) await countViewToday(house._id, new Date(Date.now() - 5 * DAY));
  for (let i = 0; i < 4; i++) await countViewToday(house._id, new Date(Date.now() - 20 * DAY));
  // Leads: an offer and an inquiry this week, an old inquiry 40 days ago
  await Offer.create({ customer: admin._id, property: house._id, owner: agent._id, ownerType: "agent", askingPrice: 600000, amount: 550000 });
  await Inquiry.create({ property: house._id, agent: agent._id, ownerType: "agent", name: "Ama", email: "ama@insights.test", message: "Is it available?" });
  const old = await Inquiry.create({ property: house._id, agent: agent._id, ownerType: "agent", name: "Kofi", email: "kofi@insights.test", message: "Still for sale?" });
  await Inquiry.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date(Date.now() - 40 * DAY) } });

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const as = (person) => async (path) => {
    const session = person.role === "admin" ? "admin" : "agent";
    const token = jwt.sign({ id: person.id, role: person.role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" });
    const response = await fetch(`${base}${path}`, { headers: { "X-Session-Domain": session, ...customerTabHeaders(session), Cookie: `${session}_token=${token}` } });
    return { code: response.status, ...(await response.json()) };
  };

  await t.test("one row per listing per day; repeated views add to it", async () => {
    assert.equal(await PropertyViewDay.countDocuments({ property: house._id }), 3);
    assert.equal((await PropertyViewDay.findOne({ property: house._id, day: startOfDay() })).count, 3);
  });

  await t.test("the last 14 days, every day listed, with saves and the period's leads", async () => {
    const { code, data } = await as(agent)(`/properties/${house.id}/insights`);
    assert.equal(code, 200);
    assert.equal(data.periodDays, 14);
    assert.equal(data.days.length, 14);
    assert.equal(data.days.at(-1).date, startOfDay().toISOString().slice(0, 10));
    assert.equal(data.days.at(-1).views, 3);
    assert.equal(data.views.period, 5);
    assert.equal(data.views.allTime, 57, "the all-time total stays on the listing");
    assert.equal(data.saves, 2);
    assert.deepEqual(data.leads, { inquiries: 1, offers: 1, viewings: 0, rentals: 0, sales: 0 });
    assert.equal(data.leadRate, 40, "2 leads per 5 views");
  });

  await t.test("a longer period includes older views and leads", async () => {
    const { data } = await as(agent)(`/properties/${house.id}/insights?days=30`);
    assert.equal(data.days.length, 30);
    assert.equal(data.views.period, 9);
    const ninety = (await as(agent)(`/properties/${house.id}/insights?days=90`)).data;
    assert.equal(ninety.leads.inquiries, 2);
    assert.equal((await as(agent)(`/properties/${house.id}/insights?days=7`)).data.periodDays, 14, "unknown periods fall back to 14 days");
  });

  await t.test("only the listing's team and admins can see it", async () => {
    assert.equal((await as(otherAgent)(`/properties/${house.id}/insights`)).code, 404);
    assert.equal((await as(admin)(`/properties/${house.id}/insights`)).code, 200);
  });
});
