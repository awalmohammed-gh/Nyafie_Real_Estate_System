import { createHmac, randomInt } from "node:crypto";
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

export const sendVerificationCode = async (user) => {
  smtpOptions(); // Fail before recording a send when SMTP has not been configured.
  const now = new Date();
  await EmailVerification.updateOne({ _id: user._id }, { $setOnInsert: { nextSendAt: new Date(0), windowStart: new Date(0), sendCount: 0, attempts: 0 } }, { upsert: true }).catch((error) => { if (error.code !== 11000) throw error; });
  await EmailVerification.updateOne({ _id: user._id, windowStart: { $lte: new Date(now.getTime() - 3600000) } }, { $set: { windowStart: now, sendCount: 0 } });
  const code = String(randomInt(100000, 1000000));
  const hash = verificationHash(user._id, user.email, code);
  const record = await EmailVerification.findOneAndUpdate({
    _id: user._id, nextSendAt: { $lte: now }, sendCount: { $lt: 5 },
  }, { $set: { email: user.email, codeHash: hash, expiresAt: new Date(now.getTime() + 600000), attempts: 0, nextSendAt: new Date(now.getTime() + 60000) }, $inc: { sendCount: 1 } }, { returnDocument: "after" });
  if (!record) {
    const current = await EmailVerification.findById(user._id);
    const retryAt = current?.sendCount >= 5 ? new Date(current.windowStart.getTime() + 3600000) : current?.nextSendAt;
    return { sent: false, retryAfter: Math.max(1, Math.ceil(((retryAt?.getTime() || now.getTime() + 60000) - now.getTime()) / 1000)) };
  }
  try { await verificationMailer.send(user.email, code); }
  catch {
    // A failed send must never leave a usable code or block an immediate delivery retry.
    await EmailVerification.updateOne({ _id: user._id, codeHash: hash }, { $unset: { codeHash: 1, expiresAt: 1 }, $set: { nextSendAt: new Date(0) } });
    throw new HttpError(503, "We couldn't send your verification email. Please try signing in again shortly.");
  }
  return { sent: true, retryAfter: 60 };
};
