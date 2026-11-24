import jwt from "jsonwebtoken";
import User from "../models/User.js";
import AdminSignInCode from "../models/AdminSignInCode.js";
import { loadUser } from "./authController.js";
import { consumeCode, issueCode } from "../utils/emailVerification.js";
import { adminSignInMailer } from "../utils/email.js";
import { setAuthCookie, clearAuthCookie } from "../utils/generateToken.js";
import { matchesSessionRole } from "../utils/sessionAccess.js";
import { HttpError, ok, fail } from "../utils/response.js";

/*
 * Admin sign-in has two steps: the password, then a six-digit code sent to the admin's email. A stolen
 * admin password alone opens nothing. The code follows the email-verification rules: 10 minutes,
 * five guesses, a new code at most every minute and five an hour, stored only as an HMAC.
 * ADMIN_TWO_STEP=off turns the second step off (only for an emergency, e.g. email delivery is down).
 */
export const adminTwoStepEnabled = () => String(process.env.ADMIN_TWO_STEP || "").trim().toLowerCase() !== "off";

const PURPOSE = "admin-sign-in";
const challengeFor = (user) => jwt.sign({ id: String(user._id), email: user.email, version: user.sessionVersion || "", purpose: PURPOSE }, process.env.JWT_KEY, { algorithm: "HS256", expiresIn: "15m" });
// "a***n@example.com": enough for the admin to recognise the inbox
const masked = (email) => String(email).replace(/^(.)(.*)(.@.*)$/, (_all, first, middle, rest) => `${first}${"*".repeat(Math.min(middle.length, 6))}${rest}`);

// Called by the admin password check (controllers/authController.js) instead of signing in
export const startAdminSignIn = async (res, user) => {
  clearAuthCookie(res, "admin");
  await AdminSignInCode.updateOne({ _id: user._id }, { $setOnInsert: { nextSendAt: new Date(0), windowStart: new Date(0), sendCount: 0, attempts: 0 } }, { upsert: true }).catch((error) => { if (error.code !== 11000) throw error; });
  let delivery;
  try { delivery = await issueCode(AdminSignInCode, user._id, user.email, adminSignInMailer); }
  catch (error) {
    if (error.status !== 503) throw error;
    delivery = { sent: false, retryAfter: 0, deliveryError: "We couldn't send your sign-in code. Please try again shortly." };
  }
  return ok(res, { verificationRequired: true, twoStep: true, email: masked(user.email), challenge: challengeFor(user), ...delivery }, "Enter the code we emailed you to finish signing in", 202);
};

// The admin the challenge was issued to, still an active admin with the same email and sessions
const challengedAdmin = async (req) => {
  let claim;
  try {
    const token = req.body?.challenge;
    if (typeof token !== "string" || token.length > 2000) throw new Error();
    claim = jwt.verify(token, process.env.JWT_KEY, { algorithms: ["HS256"] });
    if (claim.purpose !== PURPOSE || !/^[a-f\d]{24}$/i.test(claim.id || "")) throw new Error();
  } catch { throw new HttpError(401, "Your sign-in expired. Enter your email and password again."); }
  const user = await User.findById(claim.id).select("+sessionVersion");
  if (!user || !user.isActive || !matchesSessionRole(user, "admin") || user.email !== claim.email || (user.sessionVersion || "") !== claim.version)
    throw new HttpError(401, "Your sign-in expired. Enter your email and password again.");
  return user;
};

// POST /api/auth/admin/verify-email { challenge, code } -> the admin session starts here
export const verifyAdminSignIn = async (req, res) => {
  const user = await challengedAdmin(req);
  await consumeCode(AdminSignInCode, user._id, user.email, req.body?.code);
  setAuthCookie(res, user._id, "admin", user.sessionVersion);
  return ok(res, await loadUser(user._id), "Signed in");
};

// POST /api/auth/admin/resend-verification { challenge }
export const resendAdminSignIn = async (req, res) => {
  const user = await challengedAdmin(req);
  const delivery = await issueCode(AdminSignInCode, user._id, user.email, adminSignInMailer);
  if (!delivery.sent) {
    res.set("Retry-After", String(delivery.retryAfter));
    return fail(res, 429, "Please wait before requesting another code.");
  }
  return ok(res, delivery, "A new sign-in code has been sent.");
};
