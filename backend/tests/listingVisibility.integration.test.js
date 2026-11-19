import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import { isPubliclyVisible, visibleAgentIds } from "../utils/marketplace.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

const DAY = 24 * 60 * 60 * 1000;

// The listed-agents rule is one aggregation (users + subscriptions + plans) on a real database
test("public listing visibility: who is listed, priority order, single listings and page HTML", { skip: process.env.RUN_VISIBILITY_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-visibility-signing-key-32-characters";
  await Setting.create({ key: "platform", agent: { requireSubscription: true } });
  const [priorityPlan, basicPlan] = await Plan.create([
    { name: "Priority", price: 300, duration: 30, propertyLimit: 10, imageLimit: 10, priorityVisibility: true },
    { name: "Basic", price: 100, duration: 30, propertyLimit: 10, imageLimit: 10 },
  ]);
  let n = 0;
  const agent = async (name, { plan, subscription = {}, ...fields } = {}) => {
    const user = await User.create({ firstName: name, lastName: "Agent", email: `${name.toLowerCase()}@visibility.test`, password: "test-password-long-enough", role: "agent", isActive: true, agentApplication: { status: "approved" }, ...fields });
    if (plan) {
      const sub = await Subscription.create({ user: user._id, plan: plan._id, planName: plan.name, amount: plan.price, paymentReference: `visibility-${++n}`, status: "active", paymentStatus: "paid", expiresAt: new Date(Date.now() + 10 * DAY), ...subscription });
      await User.updateOne({ _id: user._id }, { $set: { subscription: sub._id } });
    }
    return User.findById(user._id);
  };
  const priority = await agent("Priority", { plan: priorityPlan });
  const basic = await agent("Basic", { plan: basicPlan });
  const expired = await agent("Expired", { plan: basicPlan, subscription: { expiresAt: new Date(Date.now() - DAY) } });
  const unpaid = await agent("Unpaid", { plan: basicPlan, subscription: { paymentStatus: "pending" } });
  const none = await agent("None");
  const suspended = await agent("Suspended", { plan: basicPlan, isActive: false });
  const pending = await agent("Pending", { plan: basicPlan, agentApplication: { status: "pending" } });
  const staff = await agent("Staff", { plan: basicPlan, agency: { owner: priority._id, role: "agent" } });

  const ids = (list) => list.map((a) => String(a.id)).sort();
  await t.test("with subscriptions required: approved, active, paid, unexpired independent agents only", async () => {
    const visible = await visibleAgentIds();
    assert.deepEqual(ids(visible), ids([{ id: priority._id }, { id: basic._id }]));
    assert.equal(visible.find((a) => String(a.id) === priority.id).priority, true, "the priority plan is carried through");
    assert.equal(visible.find((a) => String(a.id) === basic.id).priority, false);
  });

  await t.test("without required subscriptions: every approved, active independent agent", async () => {
    await Setting.updateOne({ key: "platform" }, { $set: { "agent.requireSubscription": false } });
    assert.deepEqual(ids(await visibleAgentIds()), ids([priority, basic, expired, unpaid, none].map((a) => ({ id: a._id }))));
    await Setting.updateOne({ key: "platform" }, { $set: { "agent.requireSubscription": true } });
  });

  const listing = (owner, fields = {}) => Property.create({ title: `Home of ${owner?.firstName || "NyaFie"}`, description: "A listing used to check public visibility rules.", propertyType: "Apartment", listingType: "Rent", price: 1000, pricePeriod: "month", owner: owner?._id || priority._id, ownerType: owner ? "agent" : "admin", status: "published", availability: "Available", ...fields });
  const homes = {
    priority: await listing(priority), basic: await listing(basic), expired: await listing(expired), unpaid: await listing(unpaid), suspended: await listing(suspended),
    pending: await listing(pending), staff: await listing(staff), platform: await listing(null), draft: await listing(priority, { status: "draft" }), stale: await listing(priority, { staleSince: new Date() }),
  };

  await t.test("a single listing follows exactly the same rule (including a populated owner)", async () => {
    const expected = { priority: true, basic: true, expired: false, unpaid: false, suspended: false, pending: false, staff: false, platform: true, draft: false, stale: false };
    for (const [name, home] of Object.entries(homes)) assert.equal(await isPubliclyVisible(home), expected[name], name);
    assert.equal(await isPubliclyVisible(await Property.findById(homes.priority._id).populate("owner")), true);
    assert.equal(await isPubliclyVisible(await Property.findById(homes.expired._id).populate("owner")), false);
  });

  const frontend = http.createServer((_req, res) => res.end('<!doctype html><html><head><title>T</title></head><body><div id="root"></div></body></html>'));
  frontend.listen(0, "127.0.0.1");
  await new Promise((done) => frontend.once("listening", done));
  process.env.FRONTEND_INTERNAL_URL = `http://127.0.0.1:${frontend.address().port}`;
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => Promise.all([new Promise((done) => server.close(done)), new Promise((done) => frontend.close(done))]));
  const base = `http://127.0.0.1:${server.address().port}`;

  await t.test("the details API and the page HTML show visible listings and hide the rest", async () => {
    for (const [name, home, code] of [["priority", homes.priority, 200], ["platform", homes.platform, 200], ["expired", homes.expired, 404], ["staff", homes.staff, 404], ["draft", homes.draft, 404]]) {
      assert.equal((await fetch(`${base}/api/properties/${home.id}`)).status, code, `API ${name}`);
      const page = await fetch(`${base}/house/${home.id}`);
      assert.equal(page.status, code, `page ${name}`);
      const html = await page.text();
      assert.equal(html.includes(home.title), code === 200, `page ${name} names the listing only when visible`);
    }
  });

  await t.test("the page HTML may be kept briefly by the CDN; browsers always revalidate", async () => {
    const page = await fetch(`${base}/house/${homes.priority.id}`);
    assert.equal(page.headers.get("cache-control"), "public, max-age=0, s-maxage=60, stale-while-revalidate=600");
    assert.equal(page.headers.get("set-cookie"), null, "a cached page never sets cookies");
  });

  await t.test("the catalogue lists NyaFie's listings first, then priority agents", async () => {
    const { data } = await (await fetch(`${base}/api/properties?page=1&limit=12`)).json();
    assert.deepEqual(data.items.map((item) => item.title), ["Home of NyaFie", "Home of Priority", "Home of Basic"]);
  });
});
