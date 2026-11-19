import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("listing tours: saved as provider + id, shown publicly, wrong links refused", { skip: process.env.RUN_TOURS_INTEGRATION !== "1", timeout: 90000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-tours-signing-key-32-characters";
  await Setting.create({ key: "platform", agent: { requireSubscription: false } });
  await Plan.create({ name: "Starter", price: 0, duration: 30, propertyLimit: 10, imageLimit: 10, isActive: true });
  const agent = await User.create({ emailVerifiedAt: new Date(), firstName: "Tour", lastName: "Agent", email: "agent@tours.test", phone: "0241234567", password: "test-password-long-enough", role: "agent", agentApplication: { status: "approved" } });
  const house = await Property.create({ title: "Tour house", description: "A house used to check video and 3D tour links.", propertyType: "House", listingType: "Sale", price: 700000, pricePeriod: "total", owner: agent._id, ownerType: "agent", status: "published", availability: "Available", location: { address: "1 Tour Road", neighbourhood: "Osu", city: "Accra", region: "Greater Accra" }, area: 180, images: ["/house.jpg"], contact: { phone: "0241234567", email: agent.email } });

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const token = jwt.sign({ id: agent.id, role: "agent", session: "agent", ...customerTabClaims("agent") }, process.env.JWT_KEY, { expiresIn: "1h" });
  const call = async (method, path, body, session = "agent") => {
    const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": session, ...customerTabHeaders(session), ...(session === "agent" ? { Cookie: `agent_token=${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { code: response.status, ...(await response.json()) };
  };

  await t.test("a link to another site is refused and nothing changes", async () => {
    const refused = await call("PUT", `/properties/${house.id}`, { title: "Renamed", videoUrl: "https://example.com/video" });
    assert.equal(refused.code, 400);
    assert.match(refused.message, /YouTube or Vimeo/);
    assert.equal((await Property.findById(house._id)).title, "Tour house", "the whole save was refused");
  });

  await t.test("valid links are stored as provider + id and shown on the public listing", async () => {
    const saved = await call("PUT", `/properties/${house.id}`, { videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s", virtualTourUrl: "https://my.matterport.com/show/?m=SxQL3iGyoDo" });
    assert.equal(saved.code, 200, JSON.stringify(saved).slice(0, 300));
    const stored = (await Property.findById(house._id).lean());
    assert.deepEqual(stored.video, { provider: "youtube", id: "dQw4w9WgXcQ" });
    assert.deepEqual(stored.virtualTour, { provider: "matterport", id: "SxQL3iGyoDo" });
    const page = await call("GET", `/properties/${house.id}`, null, "customer");
    assert.deepEqual(page.data.video, { provider: "youtube", id: "dQw4w9WgXcQ" });
    assert.deepEqual(page.data.virtualTour, { provider: "matterport", id: "SxQL3iGyoDo" });
  });

  await t.test("an empty link removes the tour; leaving it out keeps it", async () => {
    await call("PUT", `/properties/${house.id}`, { title: "Tour house, updated" });
    assert.equal((await Property.findById(house._id)).video.id, "dQw4w9WgXcQ", "untouched");
    await call("PUT", `/properties/${house.id}`, { videoUrl: "" });
    const after = await Property.findById(house._id).lean();
    assert.equal(after.video, null);
    assert.equal(after.virtualTour.provider, "matterport");
  });
});
