import crypto from "node:crypto";
import PropertyView from "../models/PropertyView.js";

const HOUR = 60 * 60 * 1000;
// Same viewer + same listing inside the window = one view. VIEW_WINDOW_HOURS (1-720) overrides the 24 hour default
export const VIEW_WINDOW_MS =
  Math.min(720, Math.max(1, Number(process.env.VIEW_WINDOW_HOURS) || 24)) *
  HOUR;
const RETENTION_BUFFER_MS = HOUR; // dedupe rows are deleted (TTL) shortly after their window ends

// Crawlers, link previews, uptime checks and scripts are not customer interest
const CRAWLER =
  /bot|crawl|spider|slurp|archiver|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|java\/|go-http|okhttp|node-fetch|undici|axios|postman|insomnia/i;
export const isCrawler = (userAgent) => !userAgent || CRAWLER.test(userAgent);

// HMAC key: VIEW_HASH_SECRET, or one derived from JWT_KEY so no extra setting is required
const hashKey = () =>
  process.env.VIEW_HASH_SECRET ||
  crypto
    .createHmac("sha256", process.env.JWT_KEY || "")
    .update("nyafie:property-views")
    .digest();

/**
 * Opaque, server-side viewer id. Signed-in: the user from a verified session cookie. Anonymous: the client
 * IP (req.ip, which honours the trusted proxy settings in app.js) plus the user agent, so people
 * sharing a mobile carrier IP are not merged into one. Only the keyed hash is stored; it never
 * leaves the server.
 */
export const viewerHash = (req, user) => {
  const identity = user
    ? `user:${user._id}`
    : `anon:${req.ip}|${String(req.get?.("user-agent") || "").slice(0, 256)}`;
  return crypto
    .createHmac("sha256", hashKey())
    .update(identity)
    .digest("base64url");
};

/**
 * Opens a view window for this viewer on this listing. True only for the request that opens it:
 * the unique (property, viewer) index makes simultaneous first visits safe (one insert wins), and a
 * returning viewer re-opens the window with a single conditional update once it has passed.
 */
export const claimView = async (propertyId, viewer) => {
  const now = new Date();
  const window = {
    viewedAt: now,
    expiresAt: new Date(now.getTime() + VIEW_WINDOW_MS + RETENTION_BUFFER_MS),
  };
  try {
    const { upsertedCount } = await PropertyView.updateOne(
      { property: propertyId, viewer },
      { $setOnInsert: window },
      { upsert: true },
    );
    if (upsertedCount) return true;
  } catch (error) {
    if (error.code === 11000) return false; // a parallel request for the same viewer inserted first
    throw error;
  }
  const { modifiedCount } = await PropertyView.updateOne(
    {
      property: propertyId,
      viewer,
      viewedAt: { $lte: new Date(now.getTime() - VIEW_WINDOW_MS) },
    },
    { $set: window },
  );
  return modifiedCount === 1;
};
