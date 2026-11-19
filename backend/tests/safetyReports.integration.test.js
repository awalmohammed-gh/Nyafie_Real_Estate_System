import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import SafetyReport from "../models/SafetyReport.js";
import Notification from "../models/Notification.js";
import { MAX_OPEN_REPORTS } from "../controllers/safetyReportController.js";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("safety reports: who can report what, one open report each, admin review, privacy", { skip: process.env.RUN_REPORTS_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-reports-signing-key-32-characters";
  await Setting.create({ key: "platform", agent: { requireSubscription: false } });
  const user = (fields) => User.create({ emailVerifiedAt: new Date(), lastName: "Test", password: "test-password-long-enough", phone: "0241234567", ...fields });
  const admin = await user({ firstName: "Site", email: "admin@reports.test", role: "admin" });
  const agent = await user({ firstName: "Listed", email: "agent@reports.test", role: "agent", agentApplication: { status: "approved" } });
  const otherAgent = await user({ firstName: "Other", email: "other@reports.test", role: "agent", agentApplication: { status: "approved" } });
  const pendingAgent = await user({ firstName: "Pending", email: "pending@reports.test", role: "agent", agentApplication: { status: "pending" } });
  const buyer = await user({ firstName: "Buyer", email: "buyer@reports.test" });
  let n = 0;
  const listing = (fields = {}) => Property.create({ title: `Reported home ${++n}`, description: "A listing used to check safety reports.", propertyType: "House", listingType: "Sale", price: 500000, pricePeriod: "total", owner: agent._id, ownerType: "agent", status: "published", availability: "Available", ...fields });
  const house = await listing();

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const as = (person) => async (method, path, body) => {
    const session = { agent: "agent", admin: "admin" }[person.role] || "customer";
    const token = jwt.sign({ id: person.id, role: person.role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" });
    const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": session, ...customerTabHeaders(session), Cookie: `${session}_token=${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { code: response.status, ...(await response.json()) };
  };
  const report = (person, body) => as(person)("POST", "/reports", body);

  await t.test("reports need a known reason; 'something else' needs a description", async () => {
    assert.equal((await report(buyer, { targetType: "property", targetId: house.id, reason: "boring" })).code, 400);
    assert.equal((await report(buyer, { targetType: "planet", targetId: house.id, reason: "scam" })).code, 400);
    assert.match((await report(buyer, { targetType: "property", targetId: house.id, reason: "other", details: "bad" })).message, /at least 10 characters/);
    assert.equal((await report(buyer, { targetType: "agent", targetId: agent.id, reason: "unavailable" })).code, 400, "listing reasons don't apply to agents");
  });

  await t.test("only public listings and approved agents can be reported, never your own", async () => {
    const draft = await listing({ status: "draft" });
    assert.equal((await report(buyer, { targetType: "property", targetId: draft.id, reason: "scam" })).code, 404);
    assert.equal((await report(buyer, { targetType: "agent", targetId: pendingAgent.id, reason: "scam" })).code, 404);
    assert.equal((await report(buyer, { targetType: "agent", targetId: buyer.id, reason: "scam" })).code, 404, "customers aren't agents");
    assert.equal((await report(agent, { targetType: "property", targetId: house.id, reason: "scam" })).code, 400, "own listing");
    assert.equal((await report(agent, { targetType: "agent", targetId: agent.id, reason: "conduct" })).code, 400, "own account");
    assert.equal((await report(admin, { targetType: "property", targetId: house.id, reason: "scam" })).code, 400, "admins act directly");
  });

  let listingReport;
  await t.test("a report reaches the admins, never the reported agent; sending it twice at once creates one", async () => {
    const sent = await Promise.all([1, 2, 3].map(() => report(buyer, { targetType: "property", targetId: house.id, reason: "scam", details: "Asked me to pay a viewing fee by MoMo." })));
    assert.deepEqual(sent.map((r) => r.code).sort(), [201, 409, 409]);
    assert.equal(await SafetyReport.countDocuments({ reporter: buyer._id }), 1);
    listingReport = await SafetyReport.findOne({ reporter: buyer._id });
    assert.equal(String(listingReport.agent), agent.id, "the listing's agent is recorded for the admins");
    assert.ok(await Notification.exists({ audience: "admins", title: "Possible scam reported" }));
    assert.equal(await Notification.countDocuments({ recipient: agent._id }), 0, "the reported agent hears nothing");
    assert.equal((await report(otherAgent, { targetType: "agent", targetId: agent.id, reason: "conduct" })).code, 201, "other agents can report too");
  });

  await t.test("only admins see and review reports; the reporter is thanked, the note stays internal", async () => {
    assert.equal((await as(agent)("GET", "/admin/reports")).code, 404, "the admin API is hidden from other sessions");
    const list = await as(admin)("GET", "/admin/reports");
    assert.equal(list.data.length, 2);
    const item = list.data.find((r) => r.id === String(listingReport._id));
    assert.equal(item.reasonLabel, "Asks for money upfront or looks like a scam");
    assert.equal(item.reporter.email, buyer.email);
    assert.equal(item.property.title, house.title);
    assert.equal((await as(admin)("GET", "/admin/counts")).data.openReports, 2);

    const reviewed = await Promise.all([1, 2].map(() => as(admin)("PATCH", `/admin/reports/${listingReport._id}`, { status: "resolved", note: "Listing suspended, agent warned" })));
    assert.deepEqual(reviewed.map((r) => r.code).sort(), [200, 409], "reviewed once");
    const thanks = await Notification.findOne({ recipient: buyer._id, title: "Your report was reviewed" });
    assert.match(thanks.message, /took action/);
    assert.doesNotMatch(thanks.message, /suspended|warned/, "the internal note isn't shared");
    assert.equal((await as(admin)("GET", "/admin/counts")).data.openReports, 1);
    assert.equal((await as(admin)("GET", "/admin/reports?status=resolved")).data.length, 1);
  });

  await t.test("after review the same person can report again; open reports per person are capped", async () => {
    assert.equal((await report(buyer, { targetType: "property", targetId: house.id, reason: "unavailable" })).code, 201);
    await SafetyReport.deleteMany({ reporter: buyer._id });
    for (let i = 0; i < MAX_OPEN_REPORTS; i++) await SafetyReport.create({ reporter: buyer._id, targetType: "property", property: house._id, ownerType: "agent", targetTitle: house.title, reason: "duplicate", openKey: `cap-${i}` });
    assert.equal((await report(buyer, { targetType: "agent", targetId: otherAgent.id, reason: "no_show" })).code, 429);
  });
});
