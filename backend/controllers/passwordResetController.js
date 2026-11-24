import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import PasswordReset from "../models/PasswordReset.js";
import { passwordResetMailer, smtpOptions } from "../utils/email.js";
import { matchesSessionRole } from "../utils/sessionAccess.js";
import { clearAuthCookie } from "../utils/generateToken.js";
import { loginAttempts } from "../utils/loginAttempts.js";
import { ok, fail } from "../utils/response.js";
import { passwordProblem } from "../utils/passwordPolicy.js";

const emailFrom = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = (email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const eligible = (user) => user?.isActive && matchesSessionRole(user, "customer") && user.agentApplication?.status !== "removed";
export const resetCodeHash = (id, email, code) => createHmac("sha256", process.env.JWT_KEY).update(`customer-password-reset:${id}:${email}:${code}`).digest("hex");
const genericMessage = "If an eligible account uses this email, a password reset code will arrive shortly. Check your spam folder too.";
const invalidMessage = "This reset code is invalid, expired, or already used. Request a new code.";

export const requestPasswordReset = async (req, res) => {
  const email = emailFrom(req.body?.email);
  if (!validEmail(email)) return fail(res, 400, "Enter a valid email address.");
  smtpOptions(); // A missing global configuration returns the same error for every address.
  const user = await User.findOne({ email }).select("+sessionVersion");
  if (eligible(user)) {
    const now = new Date();
    await PasswordReset.updateOne({ _id: user._id }, { $setOnInsert: { nextSendAt: new Date(0), windowStart: new Date(0), sendCount: 0, attempts: 0 } }, { upsert: true }).catch((error) => { if (error.code !== 11000) throw error; });
    await PasswordReset.updateOne({ _id: user._id, windowStart: { $lte: new Date(now.getTime() - 3600000) } }, { $set: { windowStart: now, sendCount: 0 } });
    const code = String(randomInt(100000, 1000000));
    const hash = resetCodeHash(user._id, email, code);
    const reserved = await PasswordReset.findOneAndUpdate({ _id: user._id, nextSendAt: { $lte: now }, sendCount: { $lt: 5 } }, {
      $set: { email, sessionVersion: user.sessionVersion || "", codeHash: hash, expiresAt: new Date(now.getTime() + 600000), attempts: 0, nextSendAt: new Date(now.getTime() + 60000) }, $inc: { sendCount: 1 },
    });
    if (reserved) {
      try { await passwordResetMailer.send(email, code); }
      catch {
        await PasswordReset.updateOne({ _id: user._id, codeHash: hash }, { $unset: { codeHash: 1, expiresAt: 1 }, $set: { nextSendAt: new Date(0) } });
        // Do not disclose account existence, SMTP credentials, or reset codes.
        console.error("Password reset email delivery failed.");
      }
    }
  }
  return ok(res, { retryAfter: 60 }, genericMessage);
};

export const resetCustomerPassword = async (req, res) => {
  const email = emailFrom(req.body?.email);
  const { code, newPassword } = req.body || {};
  if (!validEmail(email) || typeof code !== "string" || !/^\d{6}$/.test(code)) return fail(res, 400, invalidMessage);
  const problem = passwordProblem(newPassword);
  if (problem) return fail(res, 400, problem);
  const user = await User.findOne({ email }).select("+sessionVersion");
  if (!eligible(user)) return fail(res, 400, invalidMessage);
  const now = new Date();
  const attempt = await PasswordReset.findOneAndUpdate({ _id: user._id, email, sessionVersion: user.sessionVersion || "", codeHash: { $exists: true }, expiresAt: { $gt: now }, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }, { returnDocument: "after" }).select("+codeHash");
  const hash = resetCodeHash(user._id, email, code);
  if (!attempt || !timingSafeEqual(Buffer.from(attempt.codeHash, "hex"), Buffer.from(hash, "hex"))) return fail(res, 400, invalidMessage);
  const password = await bcrypt.hash(newPassword, 10);
  const consumed = await PasswordReset.findOneAndUpdate({ _id: user._id, codeHash: hash, expiresAt: { $gt: new Date() }, attempts: { $lte: 5 } }, { $unset: { codeHash: 1, expiresAt: 1 } });
  if (!consumed) return fail(res, 400, invalidMessage);
  const versionFilter = user.sessionVersion ? { sessionVersion: user.sessionVersion } : { $or: [{ sessionVersion: "" }, { sessionVersion: { $exists: false } }] };
  // Hash and revocation marker change in one compare-and-set write. Concurrent
  // password changes and consumed codes cannot overwrite a newer password.
  const changed = await User.findOneAndUpdate({ _id: user._id, email, isActive: true, role: user.role, ...versionFilter }, { $set: { password, passwordSetAt: now, sessionVersion: randomUUID(), emailVerifiedAt: now } });
  if (!changed) return fail(res, 400, invalidMessage);
  await loginAttempts.resetAfterRecovery(email);
  for (const session of ["customer", "agent"]) clearAuthCookie(res, session); // every session has ended
  return ok(res, null, "Password reset. Sign in with your new password. All previous sessions have been signed out.");
};
