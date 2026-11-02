import crypto from "node:crypto";
import LoginAttempt from "../models/LoginAttempt.js";

export const LOGIN_ATTEMPTS = 3;
export const LOGIN_LOCK_MS = 30 * 60 * 1000;

// Customer, agent and admin sign-ins share the credential budget, including legacy aliases.
// An unknown email gets the same counters and messages as an existing account.
const identifier = (email) => crypto.createHmac("sha256", process.env.JWT_KEY || "")
  .update(`nyafie:login:${email.trim().toLowerCase().slice(0, 254)}`).digest("hex");

export const createLoginAttempts = ({ persistent = () => process.env.NODE_ENV === "production", now = () => Date.now() } = {}) => {
  const memory = new Map();
  let sweepAt = 0;
  const readMemory = (id, time) => {
    if (time >= sweepAt) {
      for (const [key, record] of memory) if (record.expiresAt <= time) memory.delete(key);
      sweepAt = time + LOGIN_LOCK_MS;
    }
    const record = memory.get(id);
    if (record?.expiresAt <= time) { memory.delete(id); return null; }
    return record;
  };
  const state = (record, time) => ({
    failures: record && +record.expiresAt > time ? record.failures : 0,
    retryAfter: Math.max(0, Math.ceil(((+record?.lockedUntil || 0) - time) / 1000)),
  });
  const check = async (email) => {
    const id = identifier(email), time = now();
    const record = persistent() ? await LoginAttempt.collection.findOne({ _id: id }) : readMemory(id, time);
    return state(record, time);
  };
  const failure = async (email) => {
    const id = identifier(email), time = now();
    let record;
    if (persistent()) {
      const date = new Date(time), until = new Date(time + LOGIN_LOCK_MS);
      const active = { $gt: [{ $ifNull: ["$expiresAt", new Date(0)] }, date] };
      const update = [
        { $set: {
          failures: { $cond: [active, { $min: [LOGIN_ATTEMPTS, { $add: [{ $ifNull: ["$failures", 0] }, 1] }] }, 1] },
          lockedUntil: { $cond: [active, { $ifNull: ["$lockedUntil", null] }, null] },
        } },
        { $set: { lockedUntil: { $cond: [{ $gte: ["$failures", LOGIN_ATTEMPTS] }, { $ifNull: ["$lockedUntil", until] }, null] } } },
        { $set: { expiresAt: { $ifNull: ["$lockedUntil", until] } } },
      ];
      try {
        record = await LoginAttempt.collection.findOneAndUpdate({ _id: id }, update, { upsert: true, returnDocument: "after" });
      } catch (error) {
        if (error.code !== 11000) throw error;
        // Simultaneous first failures: the unique id wins once; retry the same atomic increment.
        record = await LoginAttempt.collection.findOneAndUpdate({ _id: id }, update, { returnDocument: "after" });
      }
      if (!record) throw new Error("Login attempt counter unavailable.");
    } else {
      const previous = readMemory(id, time);
      const failures = Math.min(LOGIN_ATTEMPTS, (previous?.failures || 0) + 1);
      const lockedUntil = previous?.lockedUntil || (failures >= LOGIN_ATTEMPTS ? time + LOGIN_LOCK_MS : null);
      record = { failures, lockedUntil, expiresAt: lockedUntil || time + LOGIN_LOCK_MS };
      memory.set(id, record);
    }
    return state(record, time);
  };
  const success = async (email) => {
    const id = identifier(email), time = now();
    if (persistent()) {
      // A correct password must not clear a lock established while bcrypt was running.
      await LoginAttempt.collection.deleteOne({ _id: id, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: new Date(time) } }] });
      return check(email);
    }
    const record = readMemory(id, time);
    if (state(record, time).retryAfter) return state(record, time);
    memory.delete(id);
    return state(null, time);
  };
  // Only call after the customer has proved mailbox ownership and changed their password.
  const resetAfterRecovery = async (email) => {
    const id = identifier(email);
    if (persistent()) await LoginAttempt.collection.deleteOne({ _id: id });
    else memory.delete(id);
  };
  return { check, failure, success, resetAfterRecovery };
};

export const loginAttempts = createLoginAttempts();

export const rejectLoginAttempt = (res, attempt) => {
  const remaining = Math.max(0, LOGIN_ATTEMPTS - attempt.failures);
  res.set("RateLimit-Limit", String(LOGIN_ATTEMPTS));
  res.set("RateLimit-Remaining", String(remaining));
  if (attempt.retryAfter) {
    res.set("Retry-After", String(attempt.retryAfter));
    const minutes = Math.ceil(attempt.retryAfter / 60);
    return res.status(429).json({ success: false, code: "LOGIN_LOCKED", attemptsRemaining: 0, retryAfter: attempt.retryAfter,
      message: `Too many incorrect passwords. Please wait ${minutes} ${minutes === 1 ? "minute" : "minutes"} before trying again.` });
  }
  return res.status(401).json({ success: false, code: "INVALID_CREDENTIALS", attemptsRemaining: remaining,
    message: `Incorrect email or password. ${remaining} ${remaining === 1 ? "attempt" : "attempts"} remaining.` });
};
