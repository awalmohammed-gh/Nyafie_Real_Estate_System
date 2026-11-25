import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import GoogleLoginChallenge from "../models/GoogleLoginChallenge.js";
import { googleClientId, googleIdentity, validGoogleClaims } from "../utils/googleIdentity.js";
import { CUSTOMER_TAB_HEADER, validTabSecret, tabSecretHash } from "../utils/customerTabSession.js";
import { matchesSessionRole } from "../utils/sessionAccess.js";
import { endSessions, startSession } from "../utils/sessions.js";
import { loadUser } from "./authController.js";
import { notifyAdmins } from "../utils/notify.js";
import { inboxKey, sameInbox } from "../utils/signupEmail.js";
import { ok, fail, HttpError } from "../utils/response.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const allowed = (user) => user?.isActive && matchesSessionRole(user, "customer") && user.agentApplication?.status !== "removed";
// Google has just proved this inbox is theirs, so the reason can be named
const unavailable = (user) => {
  if (user.role === "admin") return "This Gmail belongs to a NyaFie admin account, which can't sign in with Google. Use a different Gmail for a customer account.";
  return "This account is suspended or no longer active. Contact support for help.";
};

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
  let user = await User.findOne({ googleId: claims.sub }).select("+googleId +sessionVersion +passwordSetAt");
  if (user) {
    if (!allowed(user)) throw new HttpError(403, unavailable(user));
    if (inboxKey(user.email) !== inboxKey(email)) throw new HttpError(409, "Your Google email has changed. Contact support to update your account email.");
    // An admin may have changed this email and cleared its verification.
    if (!user.emailVerifiedAt) {
      user = await User.findOneAndUpdate({ _id: user._id, email: user.email, googleId: claims.sub, isActive: true }, { $set: { emailVerifiedAt: new Date() } }, { returnDocument: "after" }).select("+sessionVersion");
    }
    return { user, created: false };
  }
  user = await User.findOne({ email }).select("+googleId +sessionVersion +passwordSetAt");
  if (!user) {
    // The same Gmail inbox spelled another way (k.ofi@gmail.com): the account is this person's
    const sameInboxUsers = await User.find(sameInbox(email)).select("+googleId +sessionVersion +passwordSetAt").limit(2);
    if (sameInboxUsers.length > 1) throw new HttpError(409, "More than one account uses this Gmail inbox. Sign in with your email and password, or contact support.");
    user = sameInboxUsers[0] || null;
  }
  if (user) {
    if (!allowed(user)) throw new HttpError(403, unavailable(user));
    if (user.googleId && user.googleId !== claims.sub) throw new HttpError(409, "This account is already linked to another Google account.");
    const changes = { googleId: claims.sub, emailVerifiedAt: new Date() };
    if (user.emailVerifiedAt && !user.googleId) changes.passwordSetAt = user.passwordSetAt || new Date(); // they registered with a password
    if (!user.emailVerifiedAt) {
      // An unverified pre-existing registration may have been created by someone
      // else. Mailbox ownership must not enable that person's old password.
      changes.password = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
      changes.sessionVersion = randomUUID();
    }
    const unset = user.emailVerifiedAt ? {} : { $unset: { passwordSetAt: 1 } };
    const versionFilter = user.sessionVersion ? { sessionVersion: user.sessionVersion } : { $or: [{ sessionVersion: "" }, { sessionVersion: { $exists: false } }] };
    const linked = await User.findOneAndUpdate({ _id: user._id, email: user.email, isActive: true, role: user.role, googleId: user.googleId || { $exists: false }, ...versionFilter }, { $set: changes, ...unset }, { returnDocument: "after" }).select("+sessionVersion");
    if (!linked) throw new HttpError(409, "Your account changed during sign-in. Please try Google sign-in again.");
    if (!user.emailVerifiedAt) await endSessions(user._id, "security"); // whoever registered it before is out
    return { user: linked, created: false };
  }
  const firstName = (typeof claims.given_name === "string" && claims.given_name.trim() || typeof claims.name === "string" && claims.name.trim() || "Google").slice(0, 80);
  const lastName = (typeof claims.family_name === "string" && claims.family_name.trim() || "Customer").slice(0, 80);
  user = new User({ firstName, lastName, email, emailKey: inboxKey(email), googleId: claims.sub, emailVerifiedAt: new Date(), password: randomBytes(32).toString("hex"), role: "user" });
  user.$locals.randomPassword = true;
  await user.save();
  return { user, created: true };
};

export const googleCustomerLogin = async (req, res) => {
  if (!validTabSecret(req.get(CUSTOMER_TAB_HEADER))) return fail(res, 400, "Reload this tab to start a secure sign-in session.");
  let audience;
  try { audience = googleClientId(); }
  catch (error) { return fail(res, error.status, error.message); }
  const { credential, challenge, accountId } = req.body || {};
  if (typeof credential !== "string" || credential.length > 10000 || !credential || !validTabSecret(challenge)) return fail(res, 400, "Please choose your Google account again.");
  const filter = { _id: hash(challenge), clientId: audience, tabHash: tabSecretHash(req.get(CUSTOMER_TAB_HEADER)), expiresAt: { $gt: new Date() } };
  const pending = await GoogleLoginChallenge.findOne(filter);
  if (!pending) return fail(res, 401, "Google sign-in expired. Please try again.");
  let claims;
  try { claims = await googleIdentity.verify(credential, audience); }
  catch { return fail(res, 401, "Google could not verify this sign-in. Please try again."); }
  if (!validGoogleClaims(claims, audience, pending.nonce)) return fail(res, 401, "Use a verified Gmail or Google Workspace account to continue.");
  if (!await GoogleLoginChallenge.findOneAndDelete({ ...filter, expiresAt: { $gt: new Date() } })) return fail(res, 401, "This Google sign-in was already used. Please try again.");
  // Confirming who is signed in: the same account's Google, never a switch to (or a new) account
  if (accountId !== undefined && !(typeof accountId === "string" && /^[a-f\d]{24}$/i.test(accountId) && await User.exists({ _id: accountId, googleId: claims.sub })))
    return fail(res, 403, "That's a different Google account. Choose the one you signed in to NyaFie with.");
  let result;
  try { result = await findGoogleCustomer(claims); }
  catch (error) {
    // Two tabs can create/link the same account concurrently. A fresh attempt can
    // safely resume the winning identity rather than create a duplicate.
    if (error.code === 11000) return fail(res, 409, "This account was just updated. Please try Google sign-in again.");
    throw error;
  }
  if (!allowed(result.user)) return fail(res, 403, unavailable(result.user));
  await startSession(req, res, result.user, "customer", { startedWith: "google" });
  if (result.created) notifyAdmins({ type: "user", title: "New Google account", message: `${result.user.firstName} ${result.user.lastName} signed up with Google.`, link: "/admin/customers" });
  return ok(res, { user: await loadUser(result.user._id), created: result.created }, result.created ? "Account created with Google" : "Signed in with Google");
};
