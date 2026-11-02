import User from "../models/User.js";
import EmailVerification from "../models/EmailVerification.js";
import { loadUser } from "./authController.js";
import { verificationChallenge, readVerificationChallenge, sendVerificationCode, verificationHash } from "../utils/emailVerification.js";
import { setAuthCookie, clearAuthCookie } from "../utils/generateToken.js";
import { CUSTOMER_TAB_HEADER, validTabSecret } from "../utils/customerTabSession.js";
import { matchesSessionRole } from "../utils/sessionAccess.js";
import { ok, fail, HttpError } from "../utils/response.js";

export const startEmailVerification = async (req, res, user) => {
  clearAuthCookie(res, "customer");
  let delivery;
  try { delivery = await sendVerificationCode(user); }
  catch (error) {
    if (error.status !== 503) throw error;
    delivery = { sent: false, retryAfter: 0, deliveryError: error.message };
  }
  return ok(res, {
    verificationRequired: true, email: user.email,
    challenge: verificationChallenge(user), ...delivery,
  }, "Verify your email address to continue", 202);
};

const challengedUser = async (req) => {
  if (!validTabSecret(req.get(CUSTOMER_TAB_HEADER))) throw new HttpError(400, "Reload this tab to start a secure sign-in session.");
  const claim = readVerificationChallenge(req.body?.challenge);
  const user = await User.findById(claim.id).select("+sessionVersion");
  if (!user || !user.isActive || !matchesSessionRole(user, "customer") || user.email !== claim.email || (user.sessionVersion || "") !== claim.version || user.agentApplication?.status === "removed")
    throw new HttpError(401, "Your verification session expired. Sign in again to continue.");
  return user;
};

export const resendEmailVerification = async (req, res) => {
  const user = await challengedUser(req);
  if (user.emailVerifiedAt) return fail(res, 409, "This email is already verified. Sign in to continue.");
  const delivery = await sendVerificationCode(user);
  if (!delivery.sent) {
    res.set("Retry-After", String(delivery.retryAfter));
    return fail(res, 429, "Please wait before requesting another verification code.");
  }
  return ok(res, delivery, "A new verification code has been sent.");
};

export const verifyCustomerEmail = async (req, res) => {
  const user = await challengedUser(req);
  if (user.emailVerifiedAt) return fail(res, 409, "This email is already verified. Sign in to continue.");
  if (typeof req.body?.code !== "string" || !/^\d{6}$/.test(req.body.code)) return fail(res, 400, "Enter the six-digit code from your email.");
  const now = new Date();
  // Claim an attempt atomically before comparing. Parallel guesses share the five-attempt limit.
  const attempt = await EmailVerification.findOneAndUpdate({
    _id: user._id, email: user.email, codeHash: { $exists: true }, expiresAt: { $gt: now }, attempts: { $lt: 5 },
  }, { $inc: { attempts: 1 } }, { returnDocument: "after" }).select("+codeHash");
  if (!attempt) return fail(res, 400, "This code expired or has too many attempts. Request a new code.");
  const hash = verificationHash(user._id, user.email, req.body.code);
  if (attempt.codeHash !== hash) return fail(res, 400, "Incorrect verification code. Please check your email.");
  // Consume exactly this code once, even if verification or resend races this request.
  const consumed = await EmailVerification.findOneAndUpdate({ _id: user._id, codeHash: hash, expiresAt: { $gt: now }, attempts: { $lte: 5 } }, { $unset: { codeHash: 1, expiresAt: 1 } });
  if (!consumed) return fail(res, 400, "This code is no longer valid. Request a new code.");
  const versionFilter = user.sessionVersion ? { sessionVersion: user.sessionVersion } : { $or: [{ sessionVersion: "" }, { sessionVersion: { $exists: false } }] };
  const verified = await User.findOneAndUpdate({ _id: user._id, email: user.email, isActive: true, role: user.role, ...versionFilter }, { $set: { emailVerifiedAt: now } }, { returnDocument: "after" }).select("+sessionVersion");
  if (!verified) return fail(res, 401, "Your account changed. Sign in again to continue.");
  setAuthCookie(res, verified._id, "customer", verified.sessionVersion, req.get(CUSTOMER_TAB_HEADER));
  return ok(res, await loadUser(verified._id), "Email verified. You are signed in.");
};
