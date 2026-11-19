import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import Setting from "../models/Setting.js";
import Plan from "../models/Plan.js";
import Property from "../models/Property.js";
import { createApp } from "../app.js";
import { imageUploadOptions, MAX_STORED_SIZE } from "../utils/uploadImages.js";

const query = (value) => ({ then: (yes, no) => Promise.resolve(value).then(yes, no), catch: (no) => Promise.resolve(value).catch(no), select: () => query(value), populate: () => query(value), sort: () => query(value), lean: () => Promise.resolve(value) });

test("photos are stored resized and compressed, whatever the client sent", () => {
  const jpeg = imageUploadOptions("data:image/jpeg;base64,/9j/", { folder: "nyafie/properties" });
  assert.equal(jpeg.folder, "nyafie/properties");
  assert.deepEqual(jpeg.transformation, [{ width: MAX_STORED_SIZE, height: MAX_STORED_SIZE, crop: "limit" }, { quality: "auto:good" }]);
  assert.deepEqual(imageUploadOptions("data:image/webp;base64,UklG", {}).transformation[1], { quality: "auto:good" });
  // PNG logos keep lossless encoding (only the size is capped); SVG and GIF are stored exactly as sent
  assert.deepEqual(imageUploadOptions("data:image/png;base64,iVBO", {}).transformation, [{ width: MAX_STORED_SIZE, height: MAX_STORED_SIZE, crop: "limit" }]);
  for (const image of ["data:image/svg+xml;base64,PHN2", "data:image/gif;base64,R0lG"]) assert.deepEqual(imageUploadOptions(image, { folder: "x" }), { folder: "x" });
});

test("rate limits on payouts, upgrades, listing saves and server-rendered pages", async (t) => {
  const saved = { NODE_ENV: process.env.NODE_ENV, JWT_KEY: process.env.JWT_KEY, FRONTEND_INTERNAL_URL: process.env.FRONTEND_INTERNAL_URL };
  t.after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  process.env.NODE_ENV = "test"; // in-memory counters (production shares them through MongoDB)
  process.env.JWT_KEY = "rate-limit-coverage-signing-key-32-characters";
  // No database here: any query that isn't mocked fails at once instead of waiting for a connection.
  // Only the 429s are asserted; the handlers' own answers before the limit don't matter.
  mongoose.set("bufferCommands", false);
  t.after(() => mongoose.set("bufferCommands", true));
  t.mock.method(console, "error", () => {});
  // The agent guard (agentOnly) works out the plan and usage before the limit runs
  t.mock.method(Setting, "findOneAndUpdate", () => query({ agent: { requireSubscription: false } }));
  t.mock.method(Plan, "findOne", () => query(null));
  t.mock.method(Property, "countDocuments", async () => 0);
  t.mock.method(User, "countDocuments", async () => 0);

  const agent = new User({ emailVerifiedAt: new Date(), firstName: "Rate", lastName: "Agent", email: "rate-agent@example.test", role: "agent", isActive: true, agentApplication: { status: "approved" } });
  t.mock.method(User, "findById", (id) => query(String(id) === String(agent._id) ? agent : null));

  const frontend = http.createServer((_req, res) => res.end('<!doctype html><html><head><title>T</title></head><body><div id="root"></div></body></html>'));
  frontend.listen(0, "127.0.0.1");
  await new Promise((done) => frontend.once("listening", done));
  process.env.FRONTEND_INTERNAL_URL = `http://127.0.0.1:${frontend.address().port}`;
  const server = http.createServer(createApp({ initialize: async () => {} }));
  server.listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => Promise.all([new Promise((done) => server.close(done)), new Promise((done) => frontend.close(done))]));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = `agent_token=${jwt.sign({ id: String(agent._id), role: "agent", session: "agent" }, process.env.JWT_KEY, { expiresIn: "1h" })}`;
  const send = (path, method = "GET", body) => fetch(base + path, { method, headers: { "X-Session-Domain": "agent", Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  // The status of each of `count` requests, in order
  const statuses = async (count, request) => { const codes = []; for (let i = 0; i < count; i++) codes.push((await request(i)).status); return codes; };
  const id = new mongoose.Types.ObjectId().toString();

  await t.test("connecting a payout account (checks the password, calls Paystack): 5 per 15 minutes per account", async () => {
    const codes = await statuses(6, () => send(`/api/properties/${id}/payout`, "PUT", { type: "bank", bankCode: "GH1", accountNumber: "0123456789", password: "guess" }));
    assert.ok(codes.slice(0, 5).every((code) => code !== 429), codes.join());
    assert.equal(codes[5], 429);
    const refused = await send(`/api/properties/${id}/payout`, "PUT", {});
    assert.match((await refused.json()).message, /payout account attempts/);
    assert.ok(Number(refused.headers.get("retry-after")) > 0);
  });

  await t.test("subscription upgrades share the payment limit with checkout starts", async () => {
    const codes = await statuses(31, () => send("/api/subscriptions/upgrade", "POST", { planId: id }));
    assert.ok(codes.slice(0, 30).every((code) => code !== 429), codes.join());
    assert.equal(codes[30], 429);
    assert.equal((await send("/api/subscriptions/initialize", "POST", { planId: id })).status, 429, "the same allowance");
  });

  await t.test("listing, application and profile saves (photo uploads, geocoding): 60 per 15 minutes per account, shared", async () => {
    const paths = [["/api/properties", "POST"], [`/api/properties/${id}`, "PUT"], ["/api/agents/application", "PUT"], ["/api/agents/profile", "PUT"]];
    const codes = await statuses(61, (i) => send(paths[i % paths.length][0], paths[i % paths.length][1], { title: "Home" }));
    assert.ok(codes.slice(0, 60).every((code) => code !== 429), codes.join());
    assert.equal(codes[60], 429);
    const refused = await send("/api/agents/application", "PUT", {});
    assert.match((await refused.json()).message, /saving changes very quickly/);
  });

  await t.test("sitemaps: 20 a minute per network", async () => {
    const codes = await statuses(21, (i) => fetch(`${base}${i % 2 ? "/sitemap.xml" : "/sitemap-properties-1.xml"}`));
    assert.ok(codes.slice(0, 20).every((code) => code !== 429), codes.join());
    assert.equal(codes[20], 429);
  });

  await t.test("server-rendered pages: 120 a minute per network (sitemaps above count too)", async () => {
    const codes = await statuses(100, (i) => fetch(`${base}/house/${id}?n=${i}`));
    assert.ok(codes.every((code) => code !== 429), "21 sitemap requests + 99 pages are still allowed");
    const refused = await fetch(`${base}/about`);
    assert.equal(refused.status, 429);
    assert.match((await refused.json()).message, /Too many page requests/);
    assert.equal((await fetch(`${base}/api/health`)).status, 200, "the API has its own allowance");
  });
});
