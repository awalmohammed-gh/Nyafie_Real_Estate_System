import User from "../models/User.js";
import EmailVerification from "../models/EmailVerification.js";
import { loadUser } from "./authController.js";
import { completeRegistration, isRegistrationChallenge, resendRegistrationCode } from "./registrationController.js";
import { verificationChallenge, readVerificationChallenge, sendVerificationCode, consumeCode } from "../utils/emailVerification.js";
import { setAuthCookie, clearAuthCookie } from "../utils/generateToken.js";
import { CUSTOMER_TAB_HEADER, validTabSecret } from "../utils/customerTabSession.js";
import { matchesSessionRole } from "../utils/sessionAccess.js";
import { ok, fail, HttpError } from "../utils/response.js";

/**
 * Accounts whose email isn't proved yet (from before codes were required, or changed by an admin):
 * customers and agents enter a code at their next sign-in before anything opens.
 */
export const startEmailVerification = async (req, res, user, session = "customer") => {
  clearAuthCookie(res, session);
  let delivery;
  try { delivery = await sendVerificationCode(user); }
  catch (error) {
    if (error.status !== 503) throw error;
    delivery = { sent: false, retryAfter: 0, deliveryError: error.message };
  }
  return ok(res, {
    verificationRequired: true, email: user.email,
    challenge: verificationChallenge(user, session), ...delivery,
  }, "Verify your email address to continue", 202);
};

// Suspended agents may still sign in to read their status, so they may verify as well
const usable = (user, session) => (session === "agent" || user.isActive) && matchesSessionRole(user, session) && user.agentApplication?.status !== "removed";

const challengedUser = async (req, session) => {
  if (session === "customer" && !validTabSecret(req.get(CUSTOMER_TAB_HEADER))) throw new HttpError(400, "Reload this tab to start a secure sign-in session.");
  const claim = readVerificationChallenge(req.body?.challenge, session);
  const user = await User.findById(claim.id).select("+sessionVersion");
  if (!user || !usable(user, session) || user.email !== claim.email || (user.sessionVersion || "") !== claim.version)
    throw new HttpError(401, "Your verification session expired. Sign in again to continue.");
  return user;
};

// New sign-ups (no account yet) and existing accounts share these two endpoints.
// Built per request: the controllers import each other, so nothing runs at load time.
export const resendVerificationFor = (session) => async (req, res) => {
  if (isRegistrationChallenge(req.body?.challenge)) return resendRegistrationCode(session)(req, res);
  const user = await challengedUser(req, session);
  if (user.emailVerifiedAt) return fail(res, 409, "This email is already verified. Sign in to continue.");
  const delivery = await sendVerificationCode(user);
  if (!delivery.sent) {
    res.set("Retry-After", String(delivery.retryAfter));
    return fail(res, 429, "Please wait before requesting another verification code.");
  }
  return ok(res, delivery, "A new verification code has been sent.");
};

export const verifyEmailFor = (session) => async (req, res) => {
  if (isRegistrationChallenge(req.body?.challenge)) return completeRegistration(session)(req, res);
  const user = await challengedUser(req, session);
  if (user.emailVerifiedAt) return fail(res, 409, "This email is already verified. Sign in to continue.");
  await consumeCode(EmailVerification, user._id, user.email, req.body?.code);
  const now = new Date();
  const versionFilter = user.sessionVersion ? { sessionVersion: user.sessionVersion } : { $or: [{ sessionVersion: "" }, { sessionVersion: { $exists: false } }] };
  const verified = await User.findOneAndUpdate({ _id: user._id, email: user.email, ...(session === "agent" ? {} : { isActive: true }), role: user.role, ...versionFilter }, { $set: { emailVerifiedAt: now } }, { returnDocument: "after" }).select("+sessionVersion");
  if (!verified) return fail(res, 401, "Your account changed. Sign in again to continue.");
  setAuthCookie(res, verified._id, session, verified.sessionVersion, session === "customer" ? req.get(CUSTOMER_TAB_HEADER) : undefined);
  return ok(res, await loadUser(verified._id), "Email verified. You are signed in.");
};
