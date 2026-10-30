import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import notificationRoutes from "../routes/notificationRoutes.js";

// In-memory notifications: the mocked model methods evaluate the controller's real filters
const matches = (doc, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === "$or") return value.some((part) => matches(doc, part));
  if (value && typeof value === "object" && Array.isArray(value.$in)) return value.$in.some((v) => String(v) === String(doc[key]));
  return String(doc[key]) === String(value);
});
const chain = (rows) => ({ select: () => chain(rows), sort: () => chain(rows), limit: () => chain(rows), then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) });

const setup = async (t) => {
  process.env.JWT_KEY = "notification-deletion-test-key";
  const customer = new User({ firstName: "Ama", lastName: "Owusu", email: "ama@example.test", role: "user", isActive: true });
  const other = new User({ firstName: "Kofi", lastName: "Boateng", email: "kofi@example.test", role: "user", isActive: true });
  const agent = new User({ firstName: "Akua", lastName: "Mensah", email: "akua@example.test", role: "agent", isActive: true, agentApplication: { status: "approved" } });
  const admin = new User({ firstName: "Platform", lastName: "Admin", email: "admin@example.test", role: "admin", isActive: true });
  const users = [customer, other, agent, admin];
  const make = (recipient, extra = {}) => ({ _id: new mongoose.Types.ObjectId(), id: "", recipient: recipient?._id ?? null, audience: "user", type: "status", title: "Update", read: false, ...extra });
  let docs = [make(customer), make(customer, { read: true }), make(customer), make(other), make(agent), make(null, { audience: "admins" })];
  docs.forEach((doc) => { doc.id = String(doc._id); });
  const [mine1, mine2, mine3, others, agents, shared] = docs;

  t.mock.method(User, "findById", (id) => chain(users.find((user) => String(user._id) === String(id))));
  t.mock.method(Notification, "find", (filter) => chain(docs.filter((doc) => matches(doc, filter))));
  t.mock.method(Notification, "countDocuments", async (filter) => docs.filter((doc) => matches(doc, filter)).length);
  t.mock.method(Notification, "updateMany", async (filter, update) => { docs.filter((doc) => matches(doc, filter)).forEach((doc) => Object.assign(doc, update)); });
  t.mock.method(Notification, "deleteOne", async (filter) => {
    const doc = docs.find((d) => matches(d, filter));
    docs = docs.filter((d) => d !== doc);
    return { deletedCount: doc ? 1 : 0 };
  });
  t.mock.method(Notification, "deleteMany", async (filter) => {
    const before = docs.length;
    docs = docs.filter((doc) => !matches(doc, filter));
    return { deletedCount: before - docs.length };
  });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/notifications", notificationRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/notifications`;
  const sessions = { user: "customer", agent: "agent", admin: "admin" };
  const as = (user) => {
    const session = sessions[user.role];
    const cookie = `${session}_token=${jwt.sign({ id: String(user._id), role: user.role, session }, process.env.JWT_KEY, { expiresIn: "1h" })}`;
    return (method, path = "", body) => fetch(`${base}${path}`, { method, headers: { Cookie: cookie, "X-Session-Domain": session, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body && JSON.stringify(body) });
  };
  return { users: { customer, other, agent, admin }, notes: { mine1, mine2, mine3, others, agents, shared }, as, all: () => docs, base };
};

test("notification deletes are scoped to the authenticated account", async (t) => {
  const { users, notes, as, all, base } = await setup(t);
  const customer = as(users.customer);
  const has = (doc) => all().some((d) => d.id === doc.id);

  await t.test("signed-out requests are rejected", async () => {
    const response = await fetch(`${base}/${notes.mine1.id}`, { method: "DELETE", headers: { "X-Session-Domain": "customer" } });
    assert.equal(response.status, 401);
    assert.ok(has(notes.mine1));
  });

  await t.test("a single delete cannot reach another account's notification", async () => {
    assert.equal((await customer("DELETE", `/${notes.others.id}`)).status, 404);
    assert.equal((await customer("DELETE", `/${notes.agents.id}`)).status, 404);
    assert.equal((await customer("DELETE", "/not-an-id")).status, 404);
    assert.ok(has(notes.others) && has(notes.agents));
  });

  await t.test("a selection containing someone else's notification deletes nothing", async () => {
    const response = await customer("POST", "/delete", { ids: [notes.mine1.id, notes.others.id] });
    assert.equal(response.status, 404);
    assert.ok(has(notes.mine1) && has(notes.others));
  });

  await t.test("identity in the request body is ignored", async () => {
    const response = await customer("POST", "/delete", { ids: [notes.others.id], userId: String(users.other._id), recipient: String(users.other._id) });
    assert.equal(response.status, 404);
    assert.ok(has(notes.others));
  });

  await t.test("invalid or oversized selections are rejected", async () => {
    for (const ids of [undefined, [], "abc", ["not-an-id"], Array.from({ length: 101 }, () => String(new mongoose.Types.ObjectId()))]) {
      assert.equal((await customer("POST", "/delete", { ids })).status, 400);
    }
  });

  await t.test("own notifications delete one at a time and in bulk, with the updated list and unread count", async () => {
    const one = await customer("DELETE", `/${notes.mine1.id}`);
    assert.equal(one.status, 200);
    assert.equal(has(notes.mine1), false);
    const bulk = await customer("POST", "/delete", { ids: [notes.mine2.id, notes.mine3.id] });
    assert.equal(bulk.status, 200);
    const { data } = await bulk.json();
    assert.equal(data.deleted, 2);
    assert.deepEqual(data.items, []);
    assert.equal(data.unread, 0);
    assert.ok(has(notes.others) && has(notes.agents) && has(notes.shared));
  });

  await t.test("delete all removes only the signed-in account's notifications", async () => {
    const agent = as(users.agent);
    const response = await agent("DELETE");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.deleted, 1);
    assert.equal(has(notes.agents), false);
    assert.ok(has(notes.others) && has(notes.shared));
  });

  await t.test("marking a selection read only changes the account's own notifications", async () => {
    const response = await as(users.other)("PATCH", "/read", { ids: [notes.others.id, notes.shared.id] });
    assert.equal(response.status, 200);
    assert.equal(notes.others.read, true);
    assert.equal(notes.shared.read, false);
  });

  await t.test("admins manage their own and the shared admin notifications, never customers'", async () => {
    const admin = as(users.admin);
    assert.equal((await admin("DELETE", `/${notes.others.id}`)).status, 404);
    const response = await admin("DELETE");
    assert.equal((await response.json()).data.deleted, 1);
    assert.equal(has(notes.shared), false);
    assert.ok(has(notes.others));
  });
});
