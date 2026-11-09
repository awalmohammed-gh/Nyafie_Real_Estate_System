import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import EmailVerification from "../models/EmailVerification.js";
import Setting from "../models/Setting.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import { createApp } from "../app.js";
import { verificationMailer } from "../utils/email.js";
import { verificationChallenge } from "../utils/emailVerification.js";
import { adminEntryHeaders, customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("customer email verification requires inbox ownership before every customer entry point", {
  skip: process.env.RUN_EMAIL_INTEGRATION !== "1", timeout: 90000,
}, async (t) => {
  const previous = { JWT_KEY: process.env.JWT_KEY, SMTP_USER: process.env.SMTP_USER, SMTP_APP_PASSWORD: process.env.SMTP_APP_PASSWORD, NODE_ENV: process.env.NODE_ENV };
  Object.assign(process.env, { JWT_KEY: "email-integration-signing-key", SMTP_USER: "sender@gmail.com", SMTP_APP_PASSWORD: "test-app-password", NODE_ENV: "development" });
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  await isolatedMongo(t);
  await Setting.create({ key: "platform" });
  const deliveries = [];
  let failDelivery = false;
  t.mock.method(verificationMailer, "send", async (email, code) => { if (failDelivery) throw new Error("SMTP unavailable"); deliveries.push({ email, code }); });
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, body, cookie, proof = true) => fetch(base + "/api" + path, {
    method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "X-Session-Domain": "customer", ...(proof ? customerTabHeaders("customer") : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const details = { firstName: "Email", lastName: "Customer", email: "CUSTOMER@example.test", password: "CorrectPassword123", emailVerifiedAt: new Date(), role: "admin" };
  const signup = await request("/auth/customer/register", details);
  assert.equal(signup.status, 202);
  assert.ok(signup.headers.getSetCookie().every((cookie) => !cookie.includes("customer_token=ey")));
  const pending = (await signup.json()).data;
  assert.equal(pending.verificationRequired, true);
  assert.equal(deliveries[0].email, "customer@example.test");
  let user = await User.findOne({ email: "customer@example.test" }).select("+sessionVersion");
  assert.equal(user.emailVerifiedAt, null);
  assert.equal(user.role, "user");
  const oldCookie = "customer_token=" + jwt.sign({ id: user.id, role: "user", session: "customer", ...customerTabClaims("customer") }, process.env.JWT_KEY, { expiresIn: "1h" });
  assert.equal((await request("/auth/customer/me", undefined, oldCookie)).status, 401);
  assert.equal((await request("/users/saved", undefined, oldCookie)).status, 401);
  assert.equal((await request("/auth/customer/verify-email", { challenge: pending.challenge, code: deliveries[0].code }, undefined, false)).status, 400);
  assert.equal((await request("/auth/customer/resend-verification", { challenge: pending.challenge })).status, 429);
  assert.equal((await request("/auth/customer/verify-email", { challenge: pending.challenge, code: "000000" })).status, 400);
  assert.equal((await EmailVerification.findById(user.id)).attempts, 1);
  assert.equal((await EmailVerification.findById(user.id).select("+codeHash")).codeHash.includes(deliveries[0].code), false);
  const success = await request("/auth/customer/verify-email", { challenge: pending.challenge, code: deliveries[0].code });
  assert.equal(success.status, 200);
  const cookie = success.headers.getSetCookie().find((v) => v.startsWith("customer_token="))?.split(";")[0];
  assert.ok(cookie);
  assert.equal((await request("/auth/customer/me", undefined, cookie)).status, 200);
  assert.equal((await request("/auth/customer/verify-email", { challenge: pending.challenge, code: deliveries[0].code })).status, 409);
  assert.equal((await request("/auth/customer/login", { email: details.email, password: details.password })).status, 200);

  await t.test("booking, purchase and inquiry emails come from the verified account", async () => {
    const owner = await User.create({ firstName: "Platform", lastName: "Owner", email: "owner@example.test", password: details.password, role: "admin" });
    const listing = await Property.create({ title: "Verified contact apartment", propertyType: "Apartment", listingType: "Rent", price: 100, pricePeriod: "month", owner: owner.id, ownerType: "admin", status: "published", availability: "Available" });
    const contact = { fullName: "Email Customer", email: "dummy@invalid.test", phone: "0241234567", currentAddress: "12 Test Road" };
    const rental = await request("/rentals", { ...contact, propertyId: listing.id, startDate: "2030-01-01", endDate: "2030-02-01" }, cookie);
    assert.equal(rental.status, 201);
    assert.equal((await rental.json()).data.contactEmail, user.email);
    const inquiry = await request("/inquiries", { propertyId: listing.id, name: contact.fullName, email: contact.email, message: "Please arrange a viewing." }, cookie);
    assert.equal(inquiry.status, 201);
    assert.equal((await Inquiry.findOne({ customer: user.id })).email, user.email);
    const sale = await Property.create({ title: "Verified contact house", propertyType: "House", listingType: "Sale", price: 100000, owner: owner.id, ownerType: "admin", status: "published" });
    const purchase = await request("/sale-requests", { ...contact, propertyId: sale.id }, cookie);
    assert.equal(purchase.status, 201);
    assert.equal((await purchase.json()).data.contactEmail, user.email);
  });

  await t.test("existing customers need verification and concurrent guesses cannot exceed five attempts", async () => {
    const legacy = await User.create({ firstName: "Legacy", lastName: "Customer", email: "legacy@example.test", password: details.password });
    const login = await request("/auth/login", { email: legacy.email, password: details.password });
    assert.equal(login.status, 202);
    const verification = (await login.json()).data;
    const correct = deliveries.at(-1).code;
    await Promise.all(Array.from({ length: 6 }, () => request("/auth/customer/verify-email", { challenge: verification.challenge, code: "000000" })));
    assert.equal((await EmailVerification.findById(legacy.id)).attempts, 5);
    assert.equal((await request("/auth/customer/verify-email", { challenge: verification.challenge, code: correct })).status, 400);
    await EmailVerification.updateOne({ _id: legacy.id }, { nextSendAt: new Date(0) });
    assert.equal((await request("/auth/customer/resend-verification", { challenge: verification.challenge })).status, 200);
    const newCode = deliveries.at(-1).code;
    if (newCode !== correct) assert.equal((await request("/auth/customer/verify-email", { challenge: verification.challenge, code: correct })).status, 400);
    await EmailVerification.updateOne({ _id: legacy.id }, { expiresAt: new Date(0) });
    assert.equal((await request("/auth/customer/verify-email", { challenge: verification.challenge, code: newCode })).status, 400);
    await EmailVerification.updateOne({ _id: legacy.id }, { nextSendAt: new Date(0), sendCount: 5 });
    assert.equal((await request("/auth/customer/resend-verification", { challenge: verification.challenge })).status, 429);
  });

  await t.test("delivery failure stays recoverable; password changes invalidate verification challenges", async () => {
    failDelivery = true;
    const response = await request("/auth/customer/register", { ...details, email: "delivery@example.test" });
    assert.equal(response.status, 202);
    const verification = (await response.json()).data;
    assert.match(verification.deliveryError, /couldn't send/);
    const customer = await User.findOne({ email: "delivery@example.test" }).select("+password +sessionVersion");
    assert.equal((await EmailVerification.findById(customer.id).select("+codeHash")).codeHash, undefined);
    failDelivery = false;
    assert.equal((await request("/auth/customer/resend-verification", { challenge: verification.challenge })).status, 200);
    customer.password = "ChangedPassword123";
    await customer.save();
    assert.equal((await request("/auth/customer/verify-email", { challenge: verification.challenge, code: deliveries.at(-1).code })).status, 401);
  });

  await t.test("ordinary session tokens and inactive accounts cannot verify", async () => {
    const inactive = await User.create({ firstName: "Inactive", lastName: "Customer", email: "inactive@example.test", password: details.password, isActive: false });
    assert.equal((await request("/auth/customer/verify-email", { challenge: verificationChallenge(inactive), code: "123456" })).status, 401);
    const sessionToken = jwt.sign({ id: user.id, session: "customer" }, process.env.JWT_KEY);
    assert.equal((await request("/auth/customer/verify-email", { challenge: sessionToken, code: "123456" })).status, 401);
  });

  await t.test("an admin email change clears verification and revokes the old session", async () => {
    const admin = await User.findOne({ role: "admin" });
    const adminCookie = "admin_token=" + jwt.sign({ id: admin.id, role: "admin", session: "admin" }, process.env.JWT_KEY, { expiresIn: "1h" });
    const response = await fetch(base + `/api/admin/users/${user.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", "X-Session-Domain": "admin", ...adminEntryHeaders(), Cookie: adminCookie },
      body: JSON.stringify({ email: "new-address@example.test", emailVerifiedAt: new Date() }),
    });
    assert.equal(response.status, 200);
    const changed = await User.findById(user.id).select("+sessionVersion");
    assert.equal(changed.emailVerifiedAt, null);
    assert.ok(changed.sessionVersion);
    assert.equal((await request("/auth/customer/me", undefined, cookie)).status, 401);
  });
});
