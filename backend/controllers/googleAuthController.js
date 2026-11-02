import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import GoogleLoginChallenge from "../models/GoogleLoginChallenge.js";
import { googleClientId, googleIdentity, validGoogleClaims } from "../utils/googleIdentity.js";
import { CUSTOMER_TAB_HEADER, validTabSecret, tabSecretHash } from "../utils/customerTabSession.js";
import { matchesSessionRole } from "../utils/sessionAccess.js";
import { setAuthCookie } from "../utils/generateToken.js";
import { loadUser } from "./authController.js";
import { notifyAdmins } from "../utils/notify.js";
import { ok, fail, HttpError } from "../utils/response.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const allowed = (user) => user?.isActive && matchesSessionRole(user, "customer") && user.agentApplication?.status !== "removed";
const unavailable = "This account cannot sign in to the customer area. Contact support for help.";

export const createGoogleChallenge = async (req, res) => {
  if (!validTabSecret(req.get(CUSTOMER_TAB_HEADER))) return fail(res, 400, "Reload this tab to start a secure sign-in session.");
  let clientId;
  try { clientId = googleClientId(); }
  catch (error) { return fail(res, error.status, error.message); }
  const challenge = randomBytes(32).toString("hex");
  const nonce = randomBytes(32).toString("hex");
  await GoogleLoginChallenge.create({ _id: hash(challenge), nonce, tabHash: tabSecretHash(req.get(CUSTOMER_TAB_HEADER)), clientId, expiresAt: new Date(Date.now() + 600000) });
  return ok(res, { clientId, challenge, nonce });
};

const findGoogleCustomer = async (claims) => {
  const email = claims.email.toLowerCase();
  let user = await User.findOne({ googleId: claims.sub }).select("+googleId +sessionVersion");
  if (user) {
    if (!allowed(user)) throw new HttpError(403, unavailable);
    if (user.email !== email) throw new HttpError(409, "Your Google email has changed. Contact support to update your account email.");
    // An admin may have changed this email and cleared its verification.
    if (!user.emailVerifiedAt) {
      user = await User.findOneAndUpdate({ _id: user._id, email, googleId: claims.sub, isActive: true }, { $set: { emailVerifiedAt: new Date() } }, { returnDocument: "after" }).select("+sessionVersion");
    }
    return { user, created: false };
  }
  user = await User.findOne({ email }).select("+googleId +sessionVersion");
  if (user) {
    if (!allowed(user)) throw new HttpError(403, unavailable);
    if (user.googleId && user.googleId !== claims.sub) throw new HttpError(409, "This account is already linked to another Google account.");
    const changes = { googleId: claims.sub, emailVerifiedAt: new Date() };
    if (!user.emailVerifiedAt) {
      // An unverified pre-existing registration may have been created by someone
      // else. Mailbox ownership must not enable that person's old password.
      changes.password = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
      changes.sessionVersion = randomUUID();
    }
    const versionFilter = user.sessionVersion ? { sessionVersion: user.sessionVersion } : { $or: [{ sessionVersion: "" }, { sessionVersion: { $exists: false } }] };
    const linked = await User.findOneAndUpdate({ _id: user._id, email, isActive: true, role: user.role, googleId: user.googleId || { $exists: false }, ...versionFilter }, { $set: changes }, { returnDocument: "after" }).select("+sessionVersion");
    if (!linked) throw new HttpError(409, "Your account changed during sign-in. Please try Google sign-in again.");
    return { user: linked, created: false };
  }
  const firstName = (typeof claims.given_name === "string" && claims.given_name.trim() || typeof claims.name === "string" && claims.name.trim() || "Google").slice(0, 80);
  const lastName = (typeof claims.family_name === "string" && claims.family_name.trim() || "Customer").slice(0, 80);
  user = await User.create({ firstName, lastName, email, googleId: claims.sub, emailVerifiedAt: new Date(), password: randomBytes(32).toString("hex"), role: "user" });
  return { user, created: true };
};

export const googleCustomerLogin = async (req, res) => {
  if (!validTabSecret(req.get(CUSTOMER_TAB_HEADER))) return fail(res, 400, "Reload this tab to start a secure sign-in session.");
  let audience;
  try { audience = googleClientId(); }
  catch (error) { return fail(res, error.status, error.message); }
  const { credential, challenge } = req.body || {};
  if (typeof credential !== "string" || credential.length > 10000 || !credential || !validTabSecret(challenge)) return fail(res, 400, "Please choose your Google account again.");
  const filter = { _id: hash(challenge), clientId: audience, tabHash: tabSecretHash(req.get(CUSTOMER_TAB_HEADER)), expiresAt: { $gt: new Date() } };
  const pending = await GoogleLoginChallenge.findOne(filter);
  if (!pending) return fail(res, 401, "Google sign-in expired. Please try again.");
  let claims;
  try { claims = await googleIdentity.verify(credential, audience); }
  catch { return fail(res, 401, "Google could not verify this sign-in. Please try again."); }
  if (!validGoogleClaims(claims, audience, pending.nonce)) return fail(res, 401, "Use a verified Gmail or Google Workspace account to continue.");
  if (!await GoogleLoginChallenge.findOneAndDelete({ ...filter, expiresAt: { $gt: new Date() } })) return fail(res, 401, "This Google sign-in was already used. Please try again.");
  let result;
  try { result = await findGoogleCustomer(claims); }
  catch (error) {
    // Two tabs can create/link the same account concurrently. A fresh attempt can
    // safely resume the winning identity rather than create a duplicate.
    if (error.code === 11000) return fail(res, 409, "This account was just updated. Please try Google sign-in again.");
    throw error;
  }
  if (!allowed(result.user)) return fail(res, 403, unavailable);
  setAuthCookie(res, result.user._id, "customer", result.user.sessionVersion, req.get(CUSTOMER_TAB_HEADER));
  if (result.created) notifyAdmins({ type: "user", title: "New Google account", message: `${result.user.firstName} ${result.user.lastName} signed up with Google.`, link: "/admin/customers" });
  return ok(res, { user: await loadUser(result.user._id), created: result.created }, result.created ? "Account created with Google" : "Signed in with Google");
};
