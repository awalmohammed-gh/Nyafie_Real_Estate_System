import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import PendingRegistration from "../models/PendingRegistration.js";
import { loadUser } from "./authController.js";
import { consumeCode, issueCode } from "../utils/emailVerification.js";
import { clearAuthCookie } from "../utils/generateToken.js";
import { endBrowserSession, startSession } from "../utils/sessions.js";
import { CUSTOMER_TAB_HEADER, validTabSecret } from "../utils/customerTabSession.js";
import { notifyAdmins } from "../utils/notify.js";
import { inboxKey, sameInbox } from "../utils/signupEmail.js";
import { ok, fail, HttpError } from "../utils/response.js";

/**
 * Email/password sign-up (customers and agents). Google sign-up is unaffected: Google has already
 * confirmed the address.
 *  1. register  -> the details wait in PendingRegistration and a six-digit code is emailed. No account,
 *                  no session, no admin notice yet.
 *  2. verify    -> the right code creates the account (already verified) and signs the person in.
 * Signing in with the details of an unfinished sign-up sends a fresh code instead of failing.
 */
const ACCOUNT = { customer: "user", agent: "agent" };
const PENDING_FOR_MS = 24 * 60 * 60 * 1000;
const PURPOSE = "registration";
const EXPIRED = "Your sign-up session expired. Create your account again to get a new code.";

const challengeFor = (pending, session) => jwt.sign(
  { id: String(pending._id), email: pending.email, version: pending.version, session, purpose: PURPOSE },
  process.env.JWT_KEY, { algorithm: "HS256", expiresIn: "30m" },
);

// Routes a verification request: new sign-ups and existing customers share the same endpoints
// (only reads the purpose; the signature is checked when the challenge is used)
export const isRegistrationChallenge = (token) => {
  try { return typeof token === "string" && token.length <= 2000 && jwt.decode(token)?.purpose === PURPOSE; } catch { return false; }
};

const readChallenge = (token, session) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_KEY, { algorithms: ["HS256"] });
    if (payload.purpose !== PURPOSE || payload.session !== session || !/^[a-f\d]{24}$/i.test(payload.id || "")) throw new Error();
    return payload;
  } catch { throw new HttpError(401, EXPIRED); }
};

const checkTab = (req, session) => {
  if (session === "customer" && !validTabSecret(req.get(CUSTOMER_TAB_HEADER))) throw new HttpError(400, "Reload this tab to start a secure sign-in session.");
};

// Sends a code (or explains why not) and hands the browser what it needs to enter it
const askForCode = async (req, res, session, pending, message) => {
  await endBrowserSession(req, session, "replaced");
  clearAuthCookie(res, session);
  let delivery;
  try { delivery = await issueCode(PendingRegistration, pending._id, pending.email); }
  catch (error) {
    if (error.status !== 503) throw error;
    delivery = { sent: false, retryAfter: 0, deliveryError: error.message };
  }
  return ok(res, { verificationRequired: true, registration: true, email: pending.email, challenge: challengeFor(pending, session), ...delivery }, message, 202);
};

/**
 * Called by register and registerAgent once the details are valid and no account uses the email.
 * details: { email (normalised), password, firstName, lastName, phone }
 */
export const startRegistration = async (req, res, session, details) => {
  const account = ACCOUNT[session];
  const now = Date.now();
  const existing = await PendingRegistration.findOne({ email: details.email }).select("+passwordHash");
  // Signing up again with the same password (e.g. after closing the tab) continues the same sign-up.
  // Different details replace it: any code already sent stops working.
  const same = existing?.account === account && await bcrypt.compare(details.password, existing.passwordHash);
  const set = { account, firstName: details.firstName, lastName: details.lastName, phone: details.phone || "", deleteAt: new Date(now + PENDING_FOR_MS) };
  if (!same) Object.assign(set, { passwordHash: await bcrypt.hash(details.password, 10), version: randomUUID() });
  const update = { $set: set, $setOnInsert: { email: details.email }, ...(same ? {} : { $unset: { codeHash: 1, expiresAt: 1 } }) };
  let pending;
  try { pending = await PendingRegistration.findOneAndUpdate({ email: details.email }, update, { upsert: true, returnDocument: "after", runValidators: true }); }
  catch (error) {
    if (error.code !== 11000) throw error;
    // Two sign-ups for the same email at once: the other one created the record first
    pending = await PendingRegistration.findOneAndUpdate({ email: details.email }, { $set: set, ...(same ? {} : { $unset: { codeHash: 1, expiresAt: 1 } }) }, { returnDocument: "after" });
  }
  return askForCode(req, res, session, pending, "Enter the code we emailed you to finish creating your account.");
};

// From sign-in: the email and password belong to an unfinished sign-up, so a fresh code is sent
export const pendingRegistrationFor = async (email, password, session) => {
  const pending = await PendingRegistration.findOne({ email, account: ACCOUNT[session] }).select("+passwordHash");
  return pending && await bcrypt.compare(password, pending.passwordHash) ? pending : null;
};
export const resumeRegistration = (req, res, session, pending) => askForCode(req, res, session, pending, "Your account isn't finished yet. Enter the code we emailed you to create it.");

const loadPending = async (req, session) => {
  checkTab(req, session);
  const claim = readChallenge(req.body?.challenge, session);
  const pending = await PendingRegistration.findOne({ _id: claim.id, email: claim.email, version: claim.version, account: ACCOUNT[session] }).select("+passwordHash");
  if (pending) return pending;
  if (await User.exists({ email: claim.email })) throw new HttpError(409, "This email is already verified. Sign in to continue.");
  throw new HttpError(401, EXPIRED);
};

// POST /api/auth/{customer|agent}/resend-verification (sign-ups)
export const resendRegistrationCode = (session) => async (req, res) => {
  const pending = await loadPending(req, session);
  const delivery = await issueCode(PendingRegistration, pending._id, pending.email);
  if (!delivery.sent) {
    res.set("Retry-After", String(delivery.retryAfter));
    return fail(res, 429, "Please wait before requesting another verification code.");
  }
  return ok(res, delivery, "A new verification code has been sent.");
};

// POST /api/auth/{customer|agent}/verify-email (sign-ups): the right code creates the account
export const completeRegistration = (session) => async (req, res) => {
  const pending = await loadPending(req, session);
  await consumeCode(PendingRegistration, pending._id, pending.email, req.body?.code);
  // The account appears and the sign-up disappears together; a second, racing request finds nothing
  const user = await mongoose.connection.transaction(async (dbSession) => {
    const removed = await PendingRegistration.deleteOne({ _id: pending._id, version: pending.version }, { session: dbSession });
    if (!removed.deletedCount) throw new HttpError(409, "This sign-up was just finished or replaced. Sign in, or create your account again.");
    // Another spelling of the same inbox finished first (the unique emailKey covers the same moment)
    if (await User.exists(sameInbox(pending.email), { session: dbSession })) throw new HttpError(409, "An account with this email already exists. Sign in to continue.");
    const created = new User({
      firstName: pending.firstName, lastName: pending.lastName, email: pending.email, emailKey: inboxKey(pending.email), phone: pending.phone,
      password: pending.passwordHash, role: ACCOUNT[session], isActive: true, emailVerifiedAt: new Date(),
      ...(session === "agent" && { agentApplication: { status: "incomplete" } }),
    });
    created.$locals.passwordHashed = true;
    try { await created.save({ session: dbSession }); }
    catch (error) {
      if (error.code === 11000) throw new HttpError(409, "An account with this email already exists. Sign in to continue.");
      throw error;
    }
    return created;
  });
  if (session === "customer") notifyAdmins({ type: "user", title: "New account", message: `${user.firstName} ${user.lastName} (${user.email}) signed up.`, link: "/admin/customers" });
  await startSession(req, res, user, session, { startedWith: "code" });
  return ok(res, await loadUser(user._id), session === "agent" ? "Email verified. Complete your application to continue." : "Email verified. Your account is ready.", 201);
};
