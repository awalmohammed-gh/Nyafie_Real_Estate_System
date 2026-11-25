import mongoose from "mongoose";
import { sessionStore } from "../../utils/sessions.js";

/*
 * Sign-in sessions for tests. Cookies that tests sign by hand carry TEST_SESSION, which is active for
 * whichever account and area they name. Real sign-ins use MongoDB when a test has one, and this
 * in-memory store when it doesn't (tests that replace the models).
 */
export const TEST_SESSION = "5e55105e55105e55105e5510";
const real = { ...sessionStore };
const records = new Map();
const inMongo = () => mongoose.connection.readyState === 1;
const active = (entry, now) => !entry.endedAt && entry.expiresAt > now;

Object.assign(sessionStore, {
  create: async (record) => {
    if (inMongo()) return real.create(record);
    const entry = { ...record, _id: String(new mongoose.Types.ObjectId()), user: String(record.user), endedAt: null };
    records.set(entry._id, entry);
    return entry;
  },
  findActive: async (id, user, area, now) => {
    if (id === TEST_SESSION) return { _id: id, lastUsedAt: now };
    if (inMongo()) return real.findActive(id, user, area, now);
    const entry = records.get(id);
    return entry && entry.user === String(user) && entry.area === area && active(entry, now) ? entry : null;
  },
  touch: async (id, now) => { if (id !== TEST_SESSION && inMongo()) return real.touch(id, now); const entry = records.get(id); if (entry) entry.lastUsedAt = now; },
  listActive: async (user, now) => inMongo() ? real.listActive(user, now) : [...records.values()].filter((entry) => entry.user === String(user) && active(entry, now)).sort((a, b) => b.lastUsedAt - a.lastUsedAt),
  end: async (options) => {
    if (inMongo()) return real.end(options);
    const { user, id, ids, except, reason, now } = options;
    const chosen = [...records.values()].filter((entry) => entry.user === String(user) && !entry.endedAt && (id ? entry._id === String(id) : ids ? ids.map(String).includes(entry._id) : except ? !except.includes(entry._id) : true));
    for (const entry of chosen) Object.assign(entry, { endedAt: now, endReason: reason });
    return chosen.length;
  },
  remove: async (user, options) => {
    if (inMongo()) return real.remove(user, options);
    for (const entry of [...records.values()]) if (entry.user === String(user)) records.delete(entry._id);
  },
});
