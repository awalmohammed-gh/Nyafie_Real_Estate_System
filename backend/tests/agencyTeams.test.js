import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import Conversation from "../models/Conversation.js";
import Offer from "../models/Offer.js";
import Viewing from "../models/Viewing.js";
import Rental from "../models/Rental.js";
import SaleRequest from "../models/SaleRequest.js";
import Setting from "../models/Setting.js";
import Subscription from "../models/Subscription.js";
import Notification from "../models/Notification.js";
import TeamInvite from "../models/TeamInvite.js";
import agentRoutes from "../routes/agentRoutes.js";
import teamRoutes from "../routes/teamRoutes.js";
import propertyRoutes from "../routes/propertyRoutes.js";
import subscriptionRoutes from "../routes/subscriptionRoutes.js";
import { canHandleTeamRecord, teamFilter } from "../utils/team.js";
import { TEST_SESSION } from "./support/sessions.js";

const DAY = 24 * 60 * 60 * 1000;
const q = (value) => {
  const promise = Promise.resolve(value);
  const self = { then: promise.then.bind(promise), catch: promise.catch.bind(promise), select: () => self, populate: () => self, sort: () => self, limit: () => self, skip: () => self, lean: () => self, session: () => self };
  return self;
};
const id = () => new mongoose.Types.ObjectId();
const agent = (fields = {}) => new User({ emailVerifiedAt: new Date(), firstName: "Test", lastName: `Agent${Math.random().toString(36).slice(2, 6)}`, email: `${Math.random()}@example.test`, role: "agent", isActive: true, agentApplication: { status: "approved", agentType: "individual", profileCompletedAt: new Date() }, ...fields });

test("team visibility: owners and managers see all agency work, agents only what is assigned to them", () => {
  const owner = agent({ agentApplication: { status: "approved", agentType: "agency" } });
  const manager = agent({ agency: { owner: owner._id, role: "manager" } });
  const staff = agent({ agency: { owner: owner._id, role: "agent" } });
  const outsider = agent();
  const assigned = { owner: owner._id, assignedTo: staff._id };
  const unassigned = { owner: owner._id, assignedTo: null };
  for (const user of [owner, manager]) {
    assert.equal(canHandleTeamRecord(assigned, user), true);
    assert.equal(canHandleTeamRecord(unassigned, user), true);
  }
  assert.equal(canHandleTeamRecord(assigned, staff), true);
  assert.equal(canHandleTeamRecord(unassigned, staff), false, "staff agents don't see unassigned work");
  assert.equal(canHandleTeamRecord(assigned, outsider), false, "other agents never see the agency's work");
  assert.equal(canHandleTeamRecord(assigned, new User({ emailVerifiedAt: new Date(), firstName: "C", lastName: "U", email: "c@example.test", role: "user" })), false);
  assert.deepEqual(Object.keys(teamFilter(staff)).sort(), ["assignedTo", "owner"]);
  assert.deepEqual(Object.keys(teamFilter(manager)), ["owner"]);
  assert.equal(String(teamFilter(manager).owner), String(owner._id), "staff queries are scoped to the agency owner's records");
});

test("agency invites, joining, roles and removal are enforced on the server", async (t) => {
  process.env.JWT_KEY = "agency-teams-test-key";
  t.mock.method(mongoose.connection, "transaction", async (work) => work(null)); // no database here
  const plan = new Plan({ name: "Agency Plan", accountType: "agency", price: 600, duration: 30, propertyLimit: 25, imageLimit: 5, teamMemberLimit: 1, internalChat: false });
  const owner = agent({ agentApplication: { status: "approved", agentType: "agency", companyName: "Akwaaba Homes", profileCompletedAt: new Date() } });
  const sub = new Subscription({ user: owner._id, plan, planName: plan.name, accountType: "agency", status: "active", paymentStatus: "paid", amount: 600, paymentReference: "R-TEAM", startDate: new Date(Date.now() - DAY), expiresAt: new Date(Date.now() + 20 * DAY) });
  owner.subscription = sub._id;
  const recruit = agent({ agentApplication: { status: "incomplete", agentType: "individual" } });
  const busyAgent = agent(); // has listings of their own
  const users = [owner, recruit, busyAgent];
  const invites = [];

  const matchesUser = (user, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === "agency.owner") return String(user.agency?.owner) === String(value);
    if (key === "agency") return value.$exists === false ? !user.agency?.owner : true;
    if (key === "_id") return String(user._id) === String(value);
    if (key === "role") return user.role === value;
    return true;
  });
  t.mock.method(Setting, "findOneAndUpdate", () => q({ key: "platform", agent: { requireSubscription: true } }));
  t.mock.method(User, "findById", (userId) => q(users.find((u) => String(u._id) === String(userId)) || null));
  t.mock.method(User, "find", (filter) => q(users.filter((u) => matchesUser(u, filter || {}))));
  t.mock.method(User, "countDocuments", (filter) => q(users.filter((u) => matchesUser(u, filter)).length));
  t.mock.method(User, "exists", async (filter) => users.find((u) => matchesUser(u, filter)) || null);
  t.mock.method(User, "findOne", (filter) => q(users.find((u) => matchesUser(u, filter)) || null));
  const userUpdates = [];
  t.mock.method(User, "updateOne", async (filter, update) => {
    userUpdates.push({ filter, update });
    const user = users.find((u) => matchesUser(u, filter));
    if (!user) return { matchedCount: 0, modifiedCount: 0 };
    for (const [key, value] of Object.entries(update.$set || {})) {
      if (key === "agency") user.agency = value;
      else if (key.startsWith("agentApplication.")) user.agentApplication[key.split(".")[1]] = value;
    }
    if (update.$unset?.agency) user.agency = undefined;
    return { matchedCount: 1, modifiedCount: 1 };
  });
  t.mock.method(Subscription, "findById", (subId) => q(String(subId) === String(sub._id) ? sub : null));
  t.mock.method(Subscription, "findOne", () => q(null));
  t.mock.method(Property, "countDocuments", async () => 0);
  t.mock.method(Property, "exists", async (filter) => (String(filter.owner) === String(busyAgent._id) ? { _id: id() } : null));
  t.mock.method(Property, "aggregate", async () => []);
  t.mock.method(Inquiry, "aggregate", async () => []);
  const reassigned = [];
  for (const Model of [Property, Inquiry, Conversation, Offer, Rental, SaleRequest, Viewing]) t.mock.method(Model, "updateMany", async (filter, update) => { reassigned.push({ model: Model.modelName, filter, update }); return {}; });
  t.mock.method(Notification, "create", async () => ({}));
  t.mock.method(Notification, "findOneAndUpdate", async () => null);
  t.mock.method(TeamInvite, "create", async (doc) => { const invite = new TeamInvite(doc); invites.push(invite); return invite; });
  t.mock.method(TeamInvite, "findOne", (filter) => q(invites.find((i) => i.tokenHash === filter.tokenHash) || null));
  const open = (i) => !i.usedAt && !i.revokedAt && i.expiresAt > new Date();
  t.mock.method(TeamInvite, "countDocuments", async (filter) => invites.filter((i) => String(i.agency) === String(filter.agency) && open(i)).length);
  t.mock.method(TeamInvite, "find", (filter) => q(invites.filter((i) => String(i.agency) === String(filter.agency) && open(i))));
  t.mock.method(TeamInvite, "findOneAndUpdate", async (filter, update) => {
    const invite = invites.find((i) => String(i._id) === String(filter._id) && open(i) && (!filter.agency || String(i.agency) === String(filter.agency)));
    if (!invite) return null;
    Object.assign(invite, update);
    return invite;
  });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/agents", agentRoutes);
  app.use("/api/team", teamRoutes);
  app.use("/api/properties", propertyRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const as = (user) => (method, path, body) => fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": "agent", Cookie: `agent_token=${jwt.sign({ sid: TEST_SESSION, id: String(user._id), role: "agent", session: "agent" }, process.env.JWT_KEY, { expiresIn: "1h" })}` }, body: body && JSON.stringify(body) });
  const ownerCall = as(owner);
  let token;

  await t.test("the owner creates a single-use link; only a hash of its token is stored", async () => {
    const response = await ownerCall("POST", "/agents/team/invites", { role: "agent" });
    assert.equal(response.status, 201);
    const { data } = await response.json();
    token = data.url.split("/agent/join/")[1];
    assert.ok(token.length >= 20);
    assert.equal(invites[0].tokenHash, crypto.createHash("sha256").update(token).digest("hex"));
    assert.notEqual(invites[0].tokenHash, token);
  });

  await t.test("open invites count towards the plan's team limit", async () => {
    const response = await ownerCall("POST", "/agents/team/invites", { role: "manager" });
    assert.equal(response.status, 403);
    assert.equal(invites.length, 1);
  });

  await t.test("anyone with the link sees the agency; a bad token reveals nothing", async () => {
    const view = await fetch(`${base}/team/invites/${token}`);
    assert.equal(view.status, 200);
    assert.equal((await view.json()).data.agency.name, "Akwaaba Homes");
    assert.equal((await fetch(`${base}/team/invites/${"x".repeat(32)}`)).status, 404);
  });

  await t.test("an agent with their own listings can't join with that account", async () => {
    const response = await as(busyAgent)("POST", `/team/invites/${token}/accept`);
    assert.equal(response.status, 409);
    assert.equal(busyAgent.agency?.owner, undefined);
  });

  await t.test("an eligible applicant joins once without bypassing professional proof and admin approval", async () => {
    const response = await as(recruit)("POST", `/team/invites/${token}/accept`);
    assert.equal(response.status, 200);
    assert.equal(String(recruit.agency.owner), String(owner._id));
    assert.equal(recruit.agency.role, "agent");
    assert.equal(recruit.agentApplication.status, "incomplete");
    assert.equal(recruit.agentApplication.approvedAt, null);
    assert.equal((await as(recruit)("GET", "/agents/dashboard")).status, 403);
    assert.equal(recruit.agentApplication.companyName, "Akwaaba Homes");
    assert.ok(invites[0].usedAt, "the invite is used up");
    assert.equal((await as(busyAgent)("POST", `/team/invites/${token}/accept`)).status, 404, "a used link can't be reused");
  });

  await t.test("staff can't manage the team, buy plans, or assign work", async () => {
    // Permissions below apply after the separate professional-proof review is approved by an admin.
    recruit.agentApplication.status = "approved";
    recruit.agentApplication.proofCount = 1;
    recruit.agentApplication.profileCompletedAt = new Date();
    recruit.agentApplication.approvedAt = new Date();
    const staff = as(recruit);
    t.mock.method(Property, "find", () => q([]));
    t.mock.method(Inquiry, "find", () => q([]));
    assert.equal((await staff("GET", "/agents/dashboard")).status, 200, "staff do reach the agency workspace");
    assert.equal((await staff("GET", "/agents/inquiries")).status, 200);
    assert.equal((await staff("POST", "/agents/team/invites", { role: "manager" })).status, 403);
    assert.equal((await staff("DELETE", `/agents/team/members/${recruit._id}`)).status, 403);
    assert.equal((await staff("GET", "/agents/team")).status, 403, "staff agents don't see the team page");
    assert.equal((await staff("POST", "/subscriptions/quote", { planId: String(plan._id) })).status, 403);
    assert.equal((await staff("PATCH", `/properties/${id()}/assign`, { memberId: null })).status, 403);
  });

  await t.test("work can only be assigned to the agency's own members", async () => {
    const listing = new Property({ title: "Agency flat", owner: owner._id, ownerType: "agent", status: "published", listingType: "Rent", price: 1000 });
    t.mock.method(Property, "findOne", () => q(listing));
    const outsider = await ownerCall("PATCH", `/properties/${listing._id}/assign`, { memberId: String(busyAgent._id) });
    assert.equal(outsider.status, 400);
    assert.equal(listing.assignedTo, null);
  });

  await t.test("removing a member keeps their work with the agency and drops their approval", async () => {
    reassigned.length = 0;
    const response = await ownerCall("DELETE", `/agents/team/members/${recruit._id}`);
    assert.equal(response.status, 200);
    assert.equal(reassigned.length, 7, "listings, inquiries, chats, offers, rentals, sale requests and viewings go back to the owner");
    for (const { update } of reassigned) assert.deepEqual(update, { $set: { assignedTo: null } });
    assert.equal(recruit.agency, undefined);
    assert.equal(recruit.agentApplication.status, "incomplete", "working alone needs the usual admin approval");
  });
});
