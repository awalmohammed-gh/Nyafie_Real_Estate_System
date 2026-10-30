import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import User from "../models/User.js";
import { cloudinary } from "../config/cloudinary.js";
import { createApp } from "../app.js";

const query = (value) => ({ then: (yes, no) => Promise.resolve(value).then(yes, no), select: () => query(value), populate: () => query(value) });
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=";

test("customer profile photos use authenticated HTTP uploads and persist through session restoration", async (t) => {
  const env = { NODE_ENV: "development", PUBLIC_SITE_URL: "http://localhost:5173", CLIENT_URL: "http://localhost:5173", JWT_KEY: "customer-photo-fixture-key-at-least-32-characters" };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const customer = new User({ firstName: "Photo", lastName: "Customer", email: "photo@example.test", role: "user", isActive: true, password: "NeverExposeThis123", preferences: { inquiryUpdates: false } });
  const other = new User({ firstName: "Other", lastName: "Customer", email: "other@example.test", role: "user", isActive: true });
  const agent = new User({ firstName: "Agent", lastName: "Test", email: "agent@example.test", role: "agent", isActive: true });
  const accounts = [customer, other, agent];
  let providerFailure = false;
  let databaseFailure = false;
  const uploads = [];
  const writes = [];
  t.mock.method(User, "findById", (id) => query(accounts.find((account) => String(account._id) === String(id))));
  t.mock.method(User, "findByIdAndUpdate", async (id, update, options) => {
    if (databaseFailure) throw new Error("Fixture database error");
    writes.push({ id: String(id), update, options });
    assert.deepEqual(Object.keys(update.$set), ["profileImage"]);
    const account = accounts.find((user) => String(user._id) === String(id));
    Object.assign(account, update.$set);
    return account;
  });
  customer.save = async () => customer;
  t.mock.method(cloudinary.uploader, "upload", async (data, options) => {
    if (providerFailure) throw new Error("Provider secret must not be exposed");
    uploads.push({ data, options });
    return { secure_url: `https://res.cloudinary.com/test/image/upload/v${uploads.length}/profile.webp` };
  });
  t.mock.method(console, "error", () => {});
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = (account, session = "customer") => `${session}_token=${jwt.sign({ id: String(account._id), role: account.role, session, ...customerTabClaims(session) }, env.JWT_KEY, { expiresIn: "1h" })}`;
  const call = (method, path, { account = customer, session = "customer", body, origin = env.CLIENT_URL, cookies } = {}) => fetch(base + path, {
    method,
    headers: { ...customerTabHeaders(session), Origin: origin, "X-Session-Domain": session, ...(cookies ? { Cookie: cookies } : account ? { Cookie: cookie(account, session) } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const photoPath = "/api/auth/customer/me/photo";

  await t.test("guests, agent selectors, forged role cookies and untrusted origins cannot upload or remove a photo", async () => {
    assert.equal((await call("POST", photoPath, { account: null, body: { image } })).status, 401);
    assert.equal((await call("DELETE", photoPath, { account: null })).status, 401);
    assert.equal((await call("POST", photoPath, { account: agent, session: "agent", body: { image } })).status, 403);
    assert.equal((await call("POST", photoPath, { cookies: cookie(agent), body: { image } })).status, 401);
    assert.equal((await call("POST", photoPath, { origin: "https://attacker.example", body: { image } })).status, 403);
    assert.equal(uploads.length, 0);
  });

  await t.test("a valid customer upload is resized, saved only to that account and restored by /me", async () => {
    const response = await call("POST", photoPath, { body: { image, userId: String(other._id), role: "admin", email: other.email } });
    assert.equal(response.status, 200);
    const uploaded = (await response.json()).data;
    assert.match(uploaded.profileImage, /^https:\/\/res.cloudinary.com\//);
    assert.equal(uploaded.role, "user");
    assert.equal(Object.hasOwn(uploaded, "password"), false);
    assert.equal(writes[0].id, String(customer._id));
    assert.equal(other.profileImage, "");
    assert.equal(customer.preferences.inquiryUpdates, false);
    assert.equal(uploads[0].data, image);
    assert.equal(uploads[0].options.folder, `homebase/profiles/${customer._id}`);
    assert.deepEqual(uploads[0].options.transformation[0], { width: 512, height: 512, crop: "fill", gravity: "auto" });
    const restored = await call("GET", "/api/auth/customer/me");
    assert.equal((await restored.json()).data.profileImage, uploaded.profileImage);
  });

  await t.test("invalid formats, remote URLs, disguised content and oversized photos never reach the provider", async () => {
    const before = uploads.length;
    for (const invalid of [undefined, "https://attacker.example/photo.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/gif;base64,R0lGODlh", "data:image/png;base64,YWJjZA==", "data:image/jpeg;base64,@@@@", { url: image }]) {
      assert.equal((await call("POST", photoPath, { body: { image: invalid } })).status, 400);
    }
    const large = Buffer.alloc(2 * 1024 * 1024 + 1);
    large.set([0xff, 0xd8, 0xff]);
    assert.equal((await call("POST", photoPath, { body: { image: `data:image/jpeg;base64,${large.toString("base64")}` } })).status, 413);
    assert.equal(uploads.length, before);
  });

  await t.test("provider and database failures retain the saved photo and return an error", async () => {
    const savedPhoto = customer.profileImage;
    providerFailure = true;
    const failedUpload = await call("POST", photoPath, { body: { image } });
    assert.equal(failedUpload.status, 502);
    assert.doesNotMatch(JSON.stringify(await failedUpload.json()), /Provider secret/);
    providerFailure = false;
    databaseFailure = true;
    assert.equal((await call("POST", photoPath, { body: { image } })).status, 500);
    databaseFailure = false;
    assert.equal(customer.profileImage, savedPhoto);
  });

  await t.test("profile saves cannot bypass the upload endpoint with an arbitrary image URL", async () => {
    const savedPhoto = customer.profileImage;
    assert.equal((await call("PUT", "/api/auth/customer/me", { body: { profileImage: "https://attacker.example/photo.png" } })).status, 200);
    assert.equal(customer.profileImage, savedPhoto);
  });

  await t.test("removing a photo persists an empty image without changing another customer's account", async () => {
    other.profileImage = "https://example.test/other.webp";
    const response = await call("DELETE", photoPath, { body: { userId: String(other._id) } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.profileImage, "");
    assert.equal((await (await call("GET", "/api/auth/customer/me")).json()).data.profileImage, "");
    assert.equal(other.profileImage, "https://example.test/other.webp");
  });
});
