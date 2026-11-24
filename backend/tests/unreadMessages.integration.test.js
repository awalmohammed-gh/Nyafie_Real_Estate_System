import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { adminEntryHeaders, customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import Notification from "../models/Notification.js";
import Setting from "../models/Setting.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("the notifications request also counts each area's unread messages, and only its own", { skip: process.env.RUN_UNREAD_INTEGRATION !== "1", timeout: 90000 }, async (t) => {
  const previous = process.env.JWT_KEY;
  process.env.JWT_KEY = "isolated-unread-signing-key-at-least-32-characters";
  t.after(() => { if (previous === undefined) delete process.env.JWT_KEY; else process.env.JWT_KEY = previous; });
  await isolatedMongo(t);
  await Setting.create({ key: "platform", agent: { requireSubscription: false } });
  const person = (name, role, extra = {}) => User.create({ emailVerifiedAt: new Date(), firstName: name, lastName: "Test", email: `${name}@unread.test`, phone: "0241234567", password: "test-password-long-enough", role, ...extra });
  const approved = { status: "approved", agentType: "agency", companyName: "Unread Homes" };
  const admin = await person("admin", "admin");
  const customer = await person("customer", "user");
  const stranger = await person("stranger", "user");
  const owner = await person("owner", "agent", { agentApplication: approved, customerAccess: true });
  const other = await person("other", "agent", { agentApplication: { ...approved, agentType: "individual" } });
  const manager = await person("manager", "agent", { agentApplication: approved, agency: { owner: owner._id, role: "manager" } });
  const staff = await person("staff", "agent", { agentApplication: approved, agency: { owner: owner._id, role: "agent" } });

  // Straight into the collection: only the fields the count reads matter here
  const chat = (fields) => Conversation.collection.insertOne({ property: new mongoose.Types.ObjectId(), customer: customer._id, owner: owner._id, ownerType: "agent", status: "open", customerUnread: 0, ownerUnread: 0, lastMessageAt: new Date(), ...fields });
  await chat({ customerUnread: 2, ownerUnread: 3 });
  await chat({ ownerUnread: 4, assignedTo: staff._id });
  await chat({ customerUnread: 50, ownerUnread: 50, status: "closed" });
  await chat({ customerUnread: 1, ownerUnread: 7, owner: admin._id, ownerType: "admin" });
  await chat({ ownerUnread: 9, owner: other._id, customer: stranger._id });
  await chat({ customerUnread: 5, ownerUnread: 0, owner: other._id, customer: owner._id }); // the agent as a customer
  await Notification.create({ recipient: customer._id, type: "status", title: "Hello" });

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const ask = async (user, session) => {
    const role = { customer: "user", agent: "agent", admin: "admin" }[session];
    const token = jwt.sign({ id: user.id, role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/notifications`, { headers: { "X-Session-Domain": session, ...customerTabHeaders(session), ...(session === "admin" ? adminEntryHeaders() : {}), Cookie: `${session}_token=${token}` } });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body.data;
  };

  const mine = await ask(customer, "customer");
  assert.equal(mine.unreadMessages, 3, "closed conversations don't count");
  assert.equal(mine.unread, 1);
  assert.equal(mine.items.length, 1);
  assert.equal((await ask(stranger, "customer")).unreadMessages, 0);
  assert.equal((await ask(owner, "agent")).unreadMessages, 7);
  assert.equal((await ask(owner, "customer")).unreadMessages, 5, "an agent's own chats as a customer stay separate");
  assert.equal((await ask(manager, "agent")).unreadMessages, 7);
  assert.equal((await ask(staff, "agent")).unreadMessages, 4, "staff: only conversations assigned to them");
  assert.equal((await ask(other, "agent")).unreadMessages, 9);
  assert.equal((await ask(admin, "admin")).unreadMessages, 7, "admins: only the platform's own listings");
});
