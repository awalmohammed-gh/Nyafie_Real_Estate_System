import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import User from "../models/User.js";
import { verificationChallenge, readVerificationChallenge, verificationHash } from "../utils/emailVerification.js";
import { smtpOptions, verificationMailer, passwordResetMailer } from "../utils/email.js";

test("verification challenges cannot be replaced by session tokens and codes are keyed to identity", () => {
  const previous = process.env.JWT_KEY;
  process.env.JWT_KEY = "email-verification-unit-signing-key";
  try {
    const user = new User({ firstName: "Test", lastName: "User", email: "owner@example.test" });
    const token = verificationChallenge(user);
    const claim = readVerificationChallenge(token);
    assert.equal(claim.email, user.email);
    assert.equal(claim.exp - claim.iat, 1800);
    assert.throws(() => readVerificationChallenge(jwt.sign({ id: user.id, session: "customer" }, process.env.JWT_KEY)), /expired/);
    assert.throws(() => readVerificationChallenge(token + "x"), /expired/);
    assert.equal(user.emailVerifiedAt, null);
    const hash = verificationHash(user.id, user.email, "123456");
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.notEqual(hash, verificationHash(user.id, "other@example.test", "123456"));
    assert.notEqual(hash, verificationHash("0".repeat(24), user.email, "123456"));
  } finally { if (previous === undefined) delete process.env.JWT_KEY; else process.env.JWT_KEY = previous; }
});

test("Google SMTP uses TLS and an app password; delivery failures never report a successful send", async (t) => {
  const previous = { SMTP_USER: process.env.SMTP_USER, SMTP_APP_PASSWORD: process.env.SMTP_APP_PASSWORD };
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  delete process.env.SMTP_USER;
  delete process.env.SMTP_APP_PASSWORD;
  assert.throws(smtpOptions, /temporarily unavailable/);
  process.env.SMTP_USER = "sender@gmail.com";
  process.env.SMTP_APP_PASSWORD = "abcd efgh ijkl mnop";
  let transportOptions, message;
  t.mock.method(nodemailer, "createTransport", (options) => {
    transportOptions = options;
    return { sendMail: async (mail) => { message = mail; return { accepted: [mail.to] }; } };
  });
  await verificationMailer.send("customer@example.test", "123456");
  assert.equal(transportOptions.host, "smtp.gmail.com");
  assert.equal(transportOptions.port, 465);
  assert.equal(transportOptions.secure, true);
  assert.equal(transportOptions.auth.pass, "abcdefghijklmnop");
  assert.equal(message.from.address, "sender@gmail.com");
  assert.equal(message.to, "customer@example.test");
  assert.match(message.text, /123456/);
  await passwordResetMailer.send("customer@example.test", "654321");
  assert.match(message.subject, /Reset/);
  assert.match(message.text, /654321/);
  assert.equal(message.to, "customer@example.test");
  t.mock.method(nodemailer, "createTransport", () => ({ sendMail: async () => ({ accepted: [] }) }));
  await assert.rejects(verificationMailer.send("customer@example.test", "123456"), /did not accept/);
  await assert.rejects(passwordResetMailer.send("customer@example.test", "654321"), /did not accept/);
});
