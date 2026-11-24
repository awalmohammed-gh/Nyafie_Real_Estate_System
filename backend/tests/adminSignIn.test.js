import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import AdminSignInCode from "../models/AdminSignInCode.js";
import { adminSignInMailer } from "../utils/email.js";
import { memoryModel } from "./support/memoryModels.js";
import { adminTwoStepEnabled, resendAdminSignIn, startAdminSignIn, verifyAdminSignIn } from "../controllers/adminSignInController.js";

const ADMIN = { _id: "0000000000000000000000a1", role: "admin", isActive: true, email: "admin@example.test", firstName: "Ada", lastName: "Admin", sessionVersion: "v1" };
const query = (value) => {
  const chain = { then: (yes, no) => Promise.resolve(typeof value === "function" ? value() : value).then(yes, no) };
  for (const name of ["populate", "select", "lean", "session"]) chain[name] = () => chain;
  return chain;
};
const response = () => {
  const res = { statusCode: 200, body: null, cookies: [] };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.set = () => res;
  res.cookie = (name, value) => { res.cookies.push({ name, value }); return res; };
  res.clearCookie = (name) => { res.cookies.push({ name, value: "" }); return res; };
  return res;
};

const setup = (t, account = { ...ADMIN }) => {
  const saved = { JWT_KEY: process.env.JWT_KEY, SMTP_USER: process.env.SMTP_USER, SMTP_APP_PASSWORD: process.env.SMTP_APP_PASSWORD, ADMIN_TWO_STEP: process.env.ADMIN_TWO_STEP };
  Object.assign(process.env, { JWT_KEY: "admin-two-step-test-key-0123456789abcdef", SMTP_USER: "sender@gmail.com", SMTP_APP_PASSWORD: "app-password" });
  delete process.env.ADMIN_TWO_STEP;
  t.after(() => { for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  const codes = [];
  t.mock.method(adminSignInMailer, "send", async (email, code) => { codes.push({ email, code }); });
  const store = memoryModel(t, AdminSignInCode);
  const state = { account };
  t.mock.method(User, "findById", () => query(() => state.account));
  return { codes, store, state };
};
const begin = async () => {
  const res = response();
  await startAdminSignIn(res, ADMIN);
  return res;
};

test("the admin password alone gives no session: a code goes to the admin's own email", async (t) => {
  const { codes } = setup(t);
  const res = await begin();
  assert.equal(res.statusCode, 202);
  assert.equal(res.cookies.some((cookie) => cookie.name === "admin_token" && cookie.value), false, "no admin cookie yet");
  assert.equal(res.body.data.verificationRequired, true);
  assert.equal(res.body.data.email, "a***n@example.test", "the address is masked");
  assert.equal(codes.length, 1);
  assert.equal(codes[0].email, "admin@example.test");
  assert.match(codes[0].code, /^\d{6}$/);
});

test("the right code starts the admin session once; wrong codes are limited", async (t) => {
  const { codes } = setup(t);
  const { challenge } = (await begin()).body.data;
  for (const code of ["000000", "123456"]) {
    await assert.rejects(verifyAdminSignIn({ body: { challenge, code: code === codes[0].code ? "999999" : code } }, response()), (error) => error.status === 400);
  }
  const res = response();
  await verifyAdminSignIn({ body: { challenge, code: codes[0].code } }, res);
  assert.equal(res.statusCode, 200);
  const cookie = res.cookies.find((entry) => entry.name === "admin_token");
  assert.ok(cookie?.value);
  assert.equal(jwt.verify(cookie.value, process.env.JWT_KEY).session, "admin");
  await assert.rejects(verifyAdminSignIn({ body: { challenge, code: codes[0].code } }, response()), (error) => error.status === 400, "a code works once");
});

test("five wrong guesses use the code up, even when the sixth is right", async (t) => {
  const { codes } = setup(t);
  const { challenge } = (await begin()).body.data;
  const wrong = codes[0].code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i += 1) await assert.rejects(verifyAdminSignIn({ body: { challenge, code: wrong } }, response()), (error) => error.status === 400);
  await assert.rejects(verifyAdminSignIn({ body: { challenge, code: codes[0].code } }, response()), /too many attempts/);
});

test("the challenge only works for the same active admin, with the same password and email", async (t) => {
  const { codes, state } = setup(t);
  const { challenge } = (await begin()).body.data;
  const code = codes[0].code;
  for (const changed of [{ sessionVersion: "v2" }, { isActive: false }, { role: "agent" }, { email: "other@example.test" }]) {
    state.account = { ...ADMIN, ...changed };
    await assert.rejects(verifyAdminSignIn({ body: { challenge, code } }, response()), (error) => error.status === 401, JSON.stringify(changed));
  }
  state.account = { ...ADMIN };
  // Forged or foreign challenges
  const customerChallenge = jwt.sign({ id: ADMIN._id, email: ADMIN.email, version: "v1", purpose: "customer-email-verification" }, process.env.JWT_KEY);
  const forged = jwt.sign({ id: ADMIN._id, email: ADMIN.email, version: "v1", purpose: "admin-sign-in" }, "another-key");
  const expired = jwt.sign({ id: ADMIN._id, email: ADMIN.email, version: "v1", purpose: "admin-sign-in" }, process.env.JWT_KEY, { expiresIn: -1 });
  for (const bad of [customerChallenge, forged, expired, "", null, "x".repeat(3000)]) {
    await assert.rejects(verifyAdminSignIn({ body: { challenge: bad, code } }, response()), (error) => error.status === 401);
  }
});

test("a new code at most once a minute; ADMIN_TWO_STEP=off is the emergency switch", async (t) => {
  const { codes } = setup(t);
  const { challenge } = (await begin()).body.data;
  const res = response();
  await resendAdminSignIn({ body: { challenge } }, res);
  assert.equal(res.statusCode, 429);
  assert.equal(codes.length, 1);
  assert.equal(adminTwoStepEnabled(), true, "on unless switched off");
  process.env.ADMIN_TWO_STEP = "off";
  assert.equal(adminTwoStepEnabled(), false);
  process.env.ADMIN_TWO_STEP = "on";
  assert.equal(adminTwoStepEnabled(), true);
});

test("when the code email can't be sent, the admin is told and no session starts", async (t) => {
  const { codes } = setup(t);
  adminSignInMailer.send.mock.mockImplementation(async () => { throw new Error("SMTP down"); });
  const res = await begin();
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.data.sent, false);
  assert.match(res.body.data.deliveryError, /couldn't send your sign-in code/);
  assert.equal(codes.length, 0);
  assert.equal(res.cookies.some((cookie) => cookie.name === "admin_token" && cookie.value), false);
});
