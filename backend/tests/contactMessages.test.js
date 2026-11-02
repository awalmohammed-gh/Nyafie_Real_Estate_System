import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import ContactMessage from "../models/ContactMessage.js";
import Notification from "../models/Notification.js";
import Setting from "../models/Setting.js";
import User from "../models/User.js";
import contactRoutes from "../routes/contactRoutes.js";
import adminRoutes from "../routes/adminRoutes.js";
import { adminEntryHeaders } from "./support/customerTab.js";
import { createContactMessage } from "../controllers/contactController.js";
import { originCheck, rejectOperatorKeys } from "../middleware/security.js";

const valid = { name: " Akua Mensah ", email: " AKUA@example.test ", phone: "+233 24 123 4567", subject: " Buying a home ", message: " I'd like help finding my next home. " };
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test("contact validation refuses missing, malformed and oversized fields before saving", async () => {
  const original = ContactMessage.create;
  let writes = 0;
  ContactMessage.create = async () => { writes += 1; throw new Error("Unexpected database write"); };
  try {
    for (const fields of [undefined, { ...valid, name: { $gt: "" } }, { ...valid, email: "a@@example.test" }, { ...valid, phone: "not a phone" }, { ...valid, subject: " " }, { ...valid, name: "a".repeat(121) }, { ...valid, message: "a".repeat(4001) }, { ...valid, message: [] }]) {
      const res = response();
      await createContactMessage({ body: fields }, res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
    }
    assert.equal(writes, 0);
  } finally { ContactMessage.create = original; }
});

test("anonymous contact submission reaches an admin-only inbox and survives status updates", async (t) => {
  const records = [];
  const notifications = [];
  const methods = [[ContactMessage, "create"], [ContactMessage, "find"], [ContactMessage, "findById"], [ContactMessage, "countDocuments"], [ContactMessage, "aggregate"], [Notification, "create"], [Setting, "findOneAndUpdate"], [User, "findById"]];
  const originals = methods.map(([model, name]) => model[name]);
  const oldKey = process.env.JWT_KEY;
  const oldOrigin = process.env.CLIENT_URL;
  process.env.JWT_KEY = "contact-inbox-test-signing-key-123456";
  process.env.CLIENT_URL = "http://localhost:5173";
  const admin = { _id: new mongoose.Types.ObjectId(), role: "admin", isActive: true };
  User.findById = (id) => ({ select: async () => String(id) === String(admin._id) ? admin : null });
  Setting.findOneAndUpdate = () => ({ lean: async () => ({ notifications: { messages: true } }) });
  Notification.create = async (record) => notifications.push(record);
  const create = async (fields) => {
    const document = new ContactMessage(fields);
    await document.validate();
    const record = { ...document.toObject(), createdAt: new Date(), async save() { return this; } };
    records.push(record);
    return record;
  };
  ContactMessage.create = create;
  const matches = (record, filter) => (!filter.status || record.status === filter.status) && (!filter.$or || filter.$or.some((condition) => Object.entries(condition).every(([key, regex]) => regex.test(record[key]))));
  ContactMessage.find = (filter) => {
    let offset = 0;
    let limit = 20;
    return { sort() { return this; }, skip(value) { offset = value; return this; }, limit(value) { limit = value; return this; }, lean: async () => records.filter((record) => matches(record, filter)).slice(offset, offset + limit) };
  };
  ContactMessage.findById = async (id) => records.find((record) => String(record._id) === String(id)) || null;
  ContactMessage.countDocuments = async (filter) => records.filter((record) => matches(record, filter)).length;
  ContactMessage.aggregate = async (pipeline) => {
    const counts = {};
    records.filter((record) => matches(record, pipeline[0].$match)).forEach((record) => counts[record.status] = (counts[record.status] || 0) + 1);
    return Object.entries(counts).map(([status, count]) => ({ _id: status, count }));
  };
  const app = express();
  app.use(express.json(), cookieParser(), rejectOperatorKeys, originCheck);
  app.use("/api/contact", contactRoutes);
  app.use("/api/admin", adminRoutes);
  app.use((_error, _req, res, _next) => res.status(500).json({ success: false, message: "Message could not be saved." }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ id: String(admin._id), role: "admin", session: "admin" }, process.env.JWT_KEY);
  const call = (path, { data, method = data ? "POST" : "GET", authenticated = false, headers = {} } = {}) => fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(authenticated ? { Cookie: `admin_token=${token}`, "X-Session-Domain": "admin", ...adminEntryHeaders() } : {}), ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) });
  try {
    await t.test("public submission saves normalized, allowlisted fields and notifies admins", async () => {
      const res = await call("/api/contact", { data: { ...valid, status: "closed", ownerType: "agent", recipient: "forged" } });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.deepEqual(Object.keys(body.data), ["id"]);
      assert.equal(records[0].name, "Akua Mensah");
      assert.equal(records[0].email, "akua@example.test");
      assert.equal(records[0].status, "new");
      assert.equal(records[0].ownerType, undefined);
      assert.equal(notifications[0].audience, "admins");
      assert.equal(notifications[0].link, "/admin/contact-messages");
    });
    await t.test("visitors and unrelated role sessions cannot read or modify the inbox", async () => {
      assert.equal((await call("/api/contact")).status, 404);
      // Without the admin console's private address the inbox does not appear to exist
      assert.equal((await call("/api/admin/contact-messages")).status, 404);
      for (const role of ["customer", "agent"]) {
        assert.equal((await call("/api/admin/contact-messages", { headers: { "X-Session-Domain": role } })).status, 403);
        assert.equal((await call(`/api/admin/contact-messages/${records[0]._id}/status`, { method: "PATCH", data: { status: "closed" }, headers: { "X-Session-Domain": role } })).status, 403);
      }
      assert.equal(records[0].status, "new");
    });
    await t.test("admins can read, search literally, and change only the message status", async () => {
      const inbox = await (await call("/api/admin/contact-messages", { authenticated: true })).json();
      assert.equal(inbox.data.total, 1);
      assert.equal(inbox.data.counts.new, 1);
      assert.equal(inbox.data.items[0].message, valid.message.trim());
      const id = records[0]._id;
      const changed = await call(`/api/admin/contact-messages/${id}/status`, { authenticated: true, method: "PATCH", data: { status: "contacted", message: "forged edit" } });
      assert.equal(changed.status, 200);
      assert.equal(records[0].status, "contacted");
      assert.equal(records[0].message, valid.message.trim());
      const filtered = await (await call("/api/admin/contact-messages?status=new", { authenticated: true })).json();
      assert.equal(filtered.data.items.length, 0);
      assert.equal(filtered.data.counts.contacted, 1);
      const literal = await (await call("/api/admin/contact-messages?search=%5B.*%5D", { authenticated: true })).json();
      assert.equal(literal.data.total, 0);
      assert.equal((await call("/api/admin/contact-messages?page=-1", { authenticated: true })).status, 400);
      assert.equal((await call(`/api/admin/contact-messages/${id}/status`, { authenticated: true, method: "PATCH", data: { status: "invalid" } })).status, 400);
    });
    await t.test("failed saves, invalid input and untrusted origins never report success", async () => {
      ContactMessage.create = async () => { throw new Error("Database unavailable"); };
      assert.equal((await call("/api/contact", { data: valid })).status, 500);
      ContactMessage.create = create;
      assert.equal((await call("/api/contact", { data: { ...valid, email: "invalid" } })).status, 400);
      assert.equal((await call("/api/contact", { data: valid, headers: { Origin: "https://untrusted.test" } })).status, 403);
      assert.equal(records.length, 1);
    });
    await t.test("repeated submissions are rate limited", async () => {
      const before = records.length;
      const statuses = [];
      for (let attempt = 0; attempt < 4; attempt += 1) statuses.push((await call("/api/contact", { data: valid })).status);
      assert.ok(statuses.includes(429));
      assert.ok(records.length - before < 4);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    methods.forEach(([model, name], index) => model[name] = originals[index]);
    if (oldKey === undefined) delete process.env.JWT_KEY; else process.env.JWT_KEY = oldKey;
    if (oldOrigin === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = oldOrigin;
  }
});
