import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import EmailVerification from "../models/EmailVerification.js";
import { verificationMailer, smtpOptions } from "./email.js";
import { HttpError } from "./response.js";

export const verificationHash = (userId, email, code) => createHmac("sha256", process.env.JWT_KEY)
  .update(`email-verification:${userId}:${email}:${code}`).digest("hex");

export const verificationChallenge = (user) => jwt.sign({
  id: String(user._id), email: user.email, version: user.sessionVersion || "",
  purpose: "customer-email-verification",
}, process.env.JWT_KEY, { algorithm: "HS256", expiresIn: "30m" });

export const readVerificationChallenge = (token) => {
  try {
    if (typeof token !== "string" || token.length > 2000) throw new Error();
    const payload = jwt.verify(token, process.env.JWT_KEY, { algorithms: ["HS256"] });
    if (payload.purpose !== "customer-email-verification" || !/^[a-f\d]{24}$/i.test(payload.id || "")) throw new Error();
    return payload;
  } catch { throw new HttpError(401, "Your verification session expired. Sign in again to continue."); }
};

/**
 * Code rules shared by existing customers (EmailVerification, keyed by user id) and new sign-ups
 * (PendingRegistration). Both keep the same fields: codeHash, expiresAt, attempts, nextSendAt,
 * windowStart, sendCount.
 *  - a code lasts 10 minutes and allows 5 guesses
 *  - a new code at most every 60 seconds, and 5 per hour
 *  - codes are stored only as an HMAC, never in plain text
 */
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS = 5;
const MAX_ATTEMPTS = 5;

// Emails a new code. { sent: true, retryAfter } or, while rate limited, { sent: false, retryAfter }.
// mailer: which email carries it (verification by default; admin sign-in has its own wording)
export const issueCode = async (Model, id, email, mailer = verificationMailer) => {
  smtpOptions(); // Fail before recording a send when SMTP has not been configured.
  const now = new Date();
  await Model.updateOne({ _id: id, windowStart: { $lte: new Date(now.getTime() - WINDOW_MS) } }, { $set: { windowStart: now, sendCount: 0 } });
  const code = String(randomInt(100000, 1000000));
  const hash = verificationHash(id, email, code);
  const record = await Model.findOneAndUpdate({
    _id: id, nextSendAt: { $lte: now }, sendCount: { $lt: MAX_SENDS },
  }, { $set: { email, codeHash: hash, expiresAt: new Date(now.getTime() + CODE_TTL_MS), attempts: 0, nextSendAt: new Date(now.getTime() + RESEND_MS) }, $inc: { sendCount: 1 } }, { returnDocument: "after" });
  if (!record) {
    const current = await Model.findById(id);
    const retryAt = current?.sendCount >= MAX_SENDS ? new Date(current.windowStart.getTime() + WINDOW_MS) : current?.nextSendAt;
    return { sent: false, retryAfter: Math.max(1, Math.ceil(((retryAt?.getTime() || now.getTime() + RESEND_MS) - now.getTime()) / 1000)) };
  }
  try { await mailer.send(email, code); }
  catch {
    // A failed send must never leave a usable code or block an immediate delivery retry.
    await Model.updateOne({ _id: id, codeHash: hash }, { $unset: { codeHash: 1, expiresAt: 1 }, $set: { nextSendAt: new Date(0) } });
    throw new HttpError(503, "We couldn't send your verification email. Please try again shortly.");
  }
  return { sent: true, retryAfter: RESEND_MS / 1000 };
};

// Checks and uses up a code exactly once. Throws a 400 HttpError when it's wrong, expired or used up.
export const consumeCode = async (Model, id, email, code) => {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) throw new HttpError(400, "Enter the six-digit code from your email.");
  const now = new Date();
  // Claim an attempt atomically before comparing. Parallel guesses share the five-attempt limit.
  const attempt = await Model.findOneAndUpdate({
    _id: id, email, codeHash: { $exists: true }, expiresAt: { $gt: now }, attempts: { $lt: MAX_ATTEMPTS },
  }, { $inc: { attempts: 1 } }, { returnDocument: "after" }).select("+codeHash");
  if (!attempt) throw new HttpError(400, "This code expired or has too many attempts. Request a new code.");
  const hash = verificationHash(id, email, code);
  if (typeof attempt.codeHash !== "string" || !/^[a-f0-9]{64}$/.test(attempt.codeHash) || !timingSafeEqual(Buffer.from(attempt.codeHash, "hex"), Buffer.from(hash, "hex")))
    throw new HttpError(400, "Incorrect verification code. Please check your email.");
  // Consume exactly this code once, even if verification or resend races this request.
  const consumed = await Model.findOneAndUpdate({ _id: id, codeHash: hash, expiresAt: { $gt: now }, attempts: { $lte: MAX_ATTEMPTS } }, { $unset: { codeHash: 1, expiresAt: 1 } });
  if (!consumed) throw new HttpError(400, "This code is no longer valid. Request a new code.");
};

// Existing customers (signed up before codes were required, or whose email an admin changed)
export const sendVerificationCode = async (user) => {
  await EmailVerification.updateOne({ _id: user._id }, { $setOnInsert: { nextSendAt: new Date(0), windowStart: new Date(0), sendCount: 0, attempts: 0 } }, { upsert: true }).catch((error) => { if (error.code !== 11000) throw error; });
  return issueCode(EmailVerification, user._id, user.email);
};
