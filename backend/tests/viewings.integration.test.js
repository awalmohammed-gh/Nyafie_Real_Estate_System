import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import Viewing from "../models/Viewing.js";
import Notification from "../models/Notification.js";
import { OPEN_REQUEST_LIMITS } from "../utils/openRequestLimits.js";
import { releasePastViewings, sendViewingReminders } from "../utils/viewings.js";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

const DAY = 24 * 60 * 60 * 1000;
// A date n days from now, as the browser's date picker sends it (Ghana time is UTC)
const day = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

test("viewings: booking, answering, rescheduling, reminders and clean-up", { skip: process.env.RUN_VIEWINGS_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-viewings-signing-key-32-characters";
  await Setting.create({ key: "platform", agent: { requireSubscription: false } });
  const user = (fields) => User.create({ emailVerifiedAt: new Date(), lastName: "Test", password: "test-password-long-enough", phone: "0241234567", ...fields });
  const agent = await user({ firstName: "Listing", email: "agent@viewings.test", role: "agent", agentApplication: { status: "approved" } });
  const otherAgent = await user({ firstName: "Other", email: "other-agent@viewings.test", role: "agent", agentApplication: { status: "approved" } });
  const buyer = await user({ firstName: "Buyer", email: "buyer@viewings.test" });
  const stranger = await user({ firstName: "Stranger", email: "stranger@viewings.test" });
  let n = 0;
  const listing = (fields = {}) => Property.create({ title: `Viewing home ${++n}`, description: "A listing used to check viewing appointments.", propertyType: "House", listingType: "Sale", price: 900000, pricePeriod: "total", owner: agent._id, ownerType: "agent", status: "published", availability: "Available", ...fields });
  const house = await listing();

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const as = (person, session = person.role === "agent" ? "agent" : "customer") => async (method, path, body) => {
    const token = jwt.sign({ id: person.id, role: person.role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" });
    const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": session, ...customerTabHeaders(session), Cookie: `${session}_token=${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { code: response.status, ...(await response.json()) };
  };
  const customer = as(buyer);
  const owner = as(agent);
  const book = (body) => customer("POST", "/viewings", { propertyId: house.id, date: day(3), time: "10:30", message: "Can I see the garden too?", ...body });

  await t.test("times must be on the half hour during the day, with notice, within two months", async () => {
    for (const [body, reason] of [[{ time: "07:30" }, /between 08:00 and 18:00/], [{ time: "18:30" }, /between 08:00 and 18:00/], [{ time: "10:15" }, /half hour/], [{ date: day(0), time: "08:00" }, /./], [{ date: day(61) }, /60 days ahead/], [{ date: "2026-02-30" }, /valid date/], [{ date: "soon", time: "10:00" }, /Choose a date and time/], [{ phone: "call me" }, /phone number/]]) {
      const refused = await book(body);
      assert.equal(refused.code, 400, JSON.stringify(body));
      assert.match(refused.message, reason);
    }
  });

  await t.test("stays, sold homes and hidden listings can't be booked", async () => {
    const hotel = await listing({ listingType: "Rent", pricePeriod: "night", price: 300 });
    assert.match((await customer("POST", "/viewings", { propertyId: hotel.id, date: day(2), time: "10:00" })).message, /booked directly/);
    const sold = await listing({ availability: "Sold" });
    assert.equal((await customer("POST", "/viewings", { propertyId: sold.id, date: day(2), time: "10:00" })).code, 400);
    const draft = await listing({ status: "draft" });
    assert.equal((await customer("POST", "/viewings", { propertyId: draft.id, date: day(2), time: "10:00" })).code, 404);
  });

  let viewing;
  await t.test("a booking waits for the owner, who is notified and sees the buyer's phone", async () => {
    const booked = await book();
    assert.equal(booked.code, 201, JSON.stringify(booked));
    viewing = booked.data;
    assert.equal(viewing.status, "requested");
    assert.equal(viewing.awaiting, "owner");
    assert.equal(viewing.contactPhone, undefined, "the customer's own view doesn't need it");
    assert.ok(await Notification.exists({ recipient: agent._id, type: "viewing", title: "New viewing request" }));
    const list = await owner("GET", "/agents/viewings");
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].contactPhone, "0241234567");
    assert.equal(list.data[0].customer.email, buyer.email);
    assert.equal((await as(otherAgent)("GET", "/agents/viewings")).data.length, 0, "other agents see nothing");
    assert.equal((await as(stranger)("GET", `/viewings/${viewing.id}`)).code, 404);
  });

  await t.test("one open viewing per listing, even when the request is sent several times at once", async () => {
    const again = await Promise.all([book({ time: "11:00" }), book({ time: "11:30" }), book({ time: "12:00" })]);
    assert.ok(again.every((r) => r.code === 409), JSON.stringify(again.map((r) => r.code)));
    assert.equal(await Viewing.countDocuments({ customer: buyer._id, property: house._id }), 1);
  });

  await t.test("only the side being asked can confirm; answering at the same moment succeeds once", async () => {
    assert.equal((await customer("PATCH", `/viewings/${viewing.id}`, { action: "accept" })).code, 400, "the customer can't accept their own request");
    assert.equal((await as(otherAgent)("PATCH", `/viewings/${viewing.id}`, { action: "confirm" })).code, 404);
    const answers = await Promise.all([owner("PATCH", `/viewings/${viewing.id}`, { action: "confirm" }), owner("PATCH", `/viewings/${viewing.id}`, { action: "confirm" })]);
    assert.deepEqual(answers.map((r) => r.code).sort(), [200, 409]);
    const saved = await Viewing.findById(viewing.id);
    assert.equal(saved.status, "confirmed");
    assert.ok(await Notification.exists({ recipient: buyer._id, title: "Viewing confirmed" }));
  });

  await t.test("either side can suggest another time; the other side then accepts it", async () => {
    const moved = await owner("PATCH", `/viewings/${viewing.id}`, { action: "propose", date: day(4), time: "15:00", message: "Afternoon suits better" });
    assert.equal(moved.code, 200, JSON.stringify(moved));
    assert.equal(moved.data.status, "requested");
    assert.equal(moved.data.awaiting, "customer");
    assert.equal(moved.data.response, "Afternoon suits better");
    assert.equal((await owner("PATCH", `/viewings/${viewing.id}`, { action: "confirm" })).code, 400, "the owner can't confirm their own suggestion");
    const accepted = await customer("PATCH", `/viewings/${viewing.id}`, { action: "accept" });
    assert.equal(accepted.data.status, "confirmed");
    assert.equal(new Date(accepted.data.scheduledAt).toISOString(), `${day(4)}T15:00:00.000Z`);
  });

  await t.test("the owner marks it completed only once its time has started; then a new viewing can be booked", async () => {
    assert.match((await owner("PATCH", `/viewings/${viewing.id}`, { action: "complete" })).message, /once its time has started/);
    await Viewing.updateOne({ _id: viewing.id }, { $set: { scheduledAt: new Date(Date.now() - 60 * 60 * 1000) } });
    const done = await owner("PATCH", `/viewings/${viewing.id}`, { action: "complete" });
    assert.equal(done.data.status, "completed");
    const next = await book({ date: day(5) });
    assert.equal(next.code, 201, "a finished viewing no longer blocks the listing");
    assert.equal((await customer("PATCH", `/viewings/${next.data.id}`, { action: "cancel" })).data.status, "cancelled");
    assert.equal((await book({ date: day(6) })).code, 201, "nor does a cancelled one");
  });

  await t.test("reminders go out once for viewings today or tomorrow; unanswered past requests expire", async () => {
    const home = await listing();
    const soon = await Viewing.create({ customer: buyer._id, property: home._id, owner: agent._id, ownerType: "agent", scheduledAt: new Date(Date.now() + 20 * 60 * 60 * 1000), proposedBy: "customer", status: "confirmed", contactName: "Buyer Test", contactPhone: "0241234567" });
    const later = await Viewing.create({ customer: stranger._id, property: home._id, owner: agent._id, ownerType: "agent", scheduledAt: new Date(Date.now() + 5 * DAY), proposedBy: "customer", status: "confirmed", contactName: "Stranger Test", contactPhone: "0241234567" });
    assert.equal(await sendViewingReminders(), 1);
    assert.equal(await sendViewingReminders(), 0, "never twice");
    assert.ok((await Viewing.findById(soon._id)).reminderSentAt);
    assert.equal((await Viewing.findById(later._id)).reminderSentAt, null);
    assert.ok(await Notification.exists({ recipient: buyer._id, title: "Viewing reminder" }));
    assert.ok(await Notification.exists({ recipient: agent._id, title: "Viewing reminder" }));

    const stale = await Viewing.create({ customer: stranger._id, property: house._id, owner: agent._id, ownerType: "agent", scheduledAt: new Date(Date.now() - DAY), proposedBy: "customer", status: "requested", contactName: "Stranger Test", contactPhone: "0241234567", openKey: `${stranger._id}:${house._id}` });
    assert.equal(await releasePastViewings(), 1);
    const expired = await Viewing.findById(stale._id);
    assert.equal(expired.status, "expired");
    assert.equal(expired.openKey, undefined);
  });

  await t.test("a customer can have at most the allowed number of upcoming viewings", async () => {
    await Viewing.deleteMany({ customer: buyer._id });
    for (let i = 0; i < OPEN_REQUEST_LIMITS.viewings; i++) {
      const home = await listing();
      assert.equal((await customer("POST", "/viewings", { propertyId: home.id, date: day(2 + (i % 20)), time: "09:00" })).code, 201);
    }
    const extra = await customer("POST", "/viewings", { propertyId: (await listing()).id, date: day(2), time: "09:00" });
    assert.equal(extra.code, 429);
    assert.match(extra.message, /upcoming viewings/);
  });

  await t.test("deleting a listing cancels its open viewings and tells the customers", async () => {
    const home = await listing();
    const booked = await as(stranger)("POST", "/viewings", { propertyId: home.id, date: day(3), time: "14:00" });
    assert.equal(booked.code, 201);
    assert.equal((await owner("DELETE", `/properties/${home.id}`)).code, 200);
    const cancelled = await Viewing.findById(booked.data.id);
    assert.equal(cancelled.status, "cancelled");
    assert.ok(await Notification.exists({ recipient: stranger._id, title: "Viewing cancelled" }));
  });
});
