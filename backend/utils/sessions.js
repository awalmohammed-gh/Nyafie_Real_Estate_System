import Session from "../models/Session.js";
import { SESSION_LIFETIME, cookieSession, setAuthCookie, clearAuthCookie } from "./generateToken.js";
import { CUSTOMER_TAB_HEADER, validTabSecret } from "./customerTabSession.js";
import { deviceLabel, shortIp } from "./sessionDevice.js";

/*
 * Sign-in sessions, stored in MongoDB (models/Session.js). A cookie alone opens nothing: its session must
 * exist, belong to that account and area, and not have ended or expired.
 */
export const MAX_SESSIONS = 10; // per person and area: the one unused for longest ends
export const TOUCH_MS = 5 * 60 * 1000; // "last used" is written at most this often
const AREAS = ["customer", "agent", "admin"];

const activeFilter = (now) => ({ endedAt: null, expiresAt: { $gt: now } });

// The database side, in one place
export const sessionStore = {
  create: (record) => Session.create(record),
  findActive: (id, user, area, now) => Session.findOne({ _id: id, user, area, ...activeFilter(now) }).select("lastUsedAt").lean(),
  touch: (id, now) => Session.updateOne({ _id: id, endedAt: null }, { $set: { lastUsedAt: now } }),
  listActive: (user, now) => Session.find({ user, ...activeFilter(now) }).sort({ lastUsedAt: -1, _id: -1 }).limit(100).lean(),
  // Ends sessions of one account: one of them (id), several (ids), or all but some (except). Returns how many.
  end: async ({ user, id, ids, except, reason, now }) => {
    const filter = { user, endedAt: null, ...(id ? { _id: id } : ids ? { _id: { $in: ids } } : except ? { _id: { $nin: except } } : {}) };
    return (await Session.updateMany(filter, { $set: { endedAt: now, endReason: reason } })).modifiedCount;
  },
  remove: (user, { session } = {}) => Session.deleteMany({ user }, { session: session || null }),
};

/** Ends sessions of an account: { id }, { except: [...] } or all of them. Takes effect on their next request. */
export const endSessions = (user, reason, { id, except, now = new Date() } = {}) => sessionStore.end({ user: String(user), id, except, reason, now });
// The account is being deleted: nothing about its sign-ins is kept
export const deleteSessions = (user, options) => sessionStore.remove(String(user), options);

// The session in this browser's cookie for an area ({ sid, id }), whatever its state; null without a valid cookie
const inBrowser = (req, area) => cookieSession(req, area, { ignoreExpiration: true });

// The sessions this browser holds for one account, in any area
export const browserSessionIds = (req, user) => AREAS.map((area) => inBrowser(req, area)).filter((held) => held && held.id === String(user?._id || user)).map((held) => held.sid);

// The browser's session for this area ends (signing out, or someone else signing in over it)
export const endBrowserSession = async (req, area, reason) => {
  const held = inBrowser(req, area);
  if (held) await endSessions(held.id, reason, { id: held.sid });
  return held;
};

/** Signs a person in: stores the session, then gives the browser the cookie for it. */
export const startSession = async (req, res, user, area, { startedWith = "password" } = {}) => {
  const tab = area === "customer" ? req.get(CUSTOMER_TAB_HEADER) : undefined;
  if (area === "customer" && !validTabSecret(tab)) throw new Error("A valid customer tab session is required.");
  await endBrowserSession(req, area, "replaced");
  const now = new Date();
  const record = await sessionStore.create({
    user: user._id, area, startedWith, device: deviceLabel(req.get("User-Agent")), ip: shortIp(req.ip),
    createdAt: now, lastUsedAt: now, expiresAt: new Date(now.getTime() + SESSION_LIFETIME[area]),
  });
  const extra = (await sessionStore.listActive(String(user._id), now)).filter((entry) => entry.area === area && String(entry._id) !== String(record._id)).slice(MAX_SESSIONS - 1);
  if (extra.length) await sessionStore.end({ user: String(user._id), ids: extra.map((entry) => entry._id), reason: "too_many", now });
  setAuthCookie(res, user._id, area, user.sessionVersion, tab, { google: startedWith === "google", sid: String(record._id) });
  return record;
};

// Whether this browser holds an active session of that area for this very account
export const hasSession = async (req, area, user) => {
  const held = cookieSession(req, area);
  return Boolean(held && held.id === String(user._id) && held.sessionVersion === (user.sessionVersion || "") && await sessionStore.findActive(held.sid, held.id, area, new Date()));
};

/**
 * The agent area for someone who proved their agent account another way (paying for a plan, applying as a
 * customer): their agent session goes on, or starts. Never from a Google sign-in, which opens the customer area only.
 */
export const ensureAgentSession = async (req, res, user) => {
  if (await hasSession(req, "agent", user)) return true;
  if (req.user?.$locals?.googleSignInAt && req.sessionDomain === "customer") return false;
  await startSession(req, res, user, "agent", { startedWith: "customer" });
  return true;
};

/** Signs this browser out of an area; the same person's other area on it ends too (customer and agent are one account). */
export const signOut = async (req, res, area) => {
  const held = await endBrowserSession(req, area, "signed_out");
  clearAuthCookie(res, area);
  const linked = { customer: "agent", agent: "customer" }[area];
  if (!held || !linked || inBrowser(req, linked)?.id !== held.id) return;
  await endBrowserSession(req, linked, "signed_out");
  clearAuthCookie(res, linked);
};

// Their sessions, for "Where you're signed in"
export const listSessions = async (req, user) => {
  const here = new Set(browserSessionIds(req, user));
  return (await sessionStore.listActive(String(user._id), new Date())).map((entry) => ({
    id: String(entry._id), area: entry.area, device: entry.device || "Unknown device", network: entry.ip || "",
    startedAt: entry.createdAt, lastUsedAt: entry.lastUsedAt, expiresAt: entry.expiresAt, current: here.has(String(entry._id)),
  }));
};
