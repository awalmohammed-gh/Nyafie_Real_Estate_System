import { fail } from "../utils/response.js";
import { clientOrigins } from "../config/runtime.js";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import RateLimitBucket from "../models/RateLimitBucket.js";

const isProduction = () => process.env.NODE_ENV === "production";

// Trusted browser origins: CLIENT_URL, comma-separated for several (e.g. apex and www)
export const allowedOrigins = clientOrigins;

/**
 * Security headers for a JSON API (helmet-equivalent, no extra dependency).
 * The API never serves HTML, so its CSP blocks everything; the frontend's own CSP belongs
 * to the static host that serves it.
 */
export const securityHeaders = (_req, res, next) => {
  res.set({
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  if (isProduction()) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
};

/**
 * Content Security Policy for the site's pages (routes/seoRoutes.js), sent as Report-Only for now:
 * nothing is blocked; browsers report what would have been to /api/csp-report (written to the logs).
 * Once the logs stay quiet in production, switch the header name to Content-Security-Policy.
 * What the pages legitimately use:
 *  - scripts: our own bundles and Google sign-in (no inline scripts; page metadata is JSON data)
 *  - styles: our own, inline style attributes (React, animations, maps), Google Fonts and Google sign-in
 *  - images: any HTTPS (Cloudinary photos, map tiles, video thumbnails, older listing image links)
 *  - connections: our own API, Google sign-in and Sentry error reports
 *  - frames: Google sign-in and the video/virtual tour players (utils/mediaLinks.js on the frontend)
 */
export const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' https: data: blob:",
  "connect-src 'self' https://accounts.google.com/gsi/ https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
  "frame-src https://accounts.google.com/gsi/ https://www.youtube-nocookie.com https://player.vimeo.com https://my.matterport.com https://kuula.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "report-uri /api/csp-report",
].join("; ");

// POST /api/csp-report: one short log line per violation (never the full report, which can hold URLs with queries)
export const cspReport = (req, res) => {
  const body = Array.isArray(req.body) ? req.body[0]?.body : req.body?.["csp-report"] || req.body;
  const pick = (...keys) => String(keys.map((key) => body?.[key]).find(Boolean) || "").split("?")[0].slice(0, 200);
  if (body && typeof body === "object") console.warn(`CSP report-only: ${pick("effectiveDirective", "violated-directive", "effective-directive")} blocked ${pick("blockedURL", "blocked-uri")} on ${pick("documentURL", "document-uri")}`);
  res.sendStatus(204);
};

/**
 * CSRF defence in depth for cookie-authenticated requests: state-changing requests that carry an
 * Origin (or Referer) must come from the trusted frontend. Browsers always send Origin on
 * cross-site POST/PUT/PATCH/DELETE, so a forged form or fetch from another site is refused.
 * Requests without either header (server-to-server tools, tests) carry no ambient browser
 * cookies from another site and are allowed through to the normal auth checks.
 */
export const originCheck = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("Origin") || (() => {
    try {
      return new URL(req.get("Referer")).origin;
    } catch {
      return null;
    }
  })();
  if (origin && !allowedOrigins().includes(origin)) return fail(res, 403, "Request blocked: untrusted origin.");
  next();
};

/**
 * NoSQL-injection and prototype-pollution guard: request bodies may not contain MongoDB
 * operator keys ($gt, $ne, $where...) or prototype keys, at any depth. No legitimate client
 * request uses them; server code builds every query operator itself.
 */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const hasForbiddenKey = (value, depth = 0) => {
  if (depth > 20) return true; // absurdly deep payloads are refused too
  if (Array.isArray(value)) return value.some((item) => hasForbiddenKey(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.keys(value).some((key) => key.startsWith("$") || FORBIDDEN_KEYS.has(key) || hasForbiddenKey(value[key], depth + 1));
  }
  return false;
};
export const rejectOperatorKeys = (req, res, next) => {
  if (req.body && hasForbiddenKey(req.body)) return fail(res, 400, "Invalid request.");
  next();
};

/**
 * Production counters are atomic MongoDB records shared by all function instances.
 * Development uses in-memory counters. Only hashed identifiers are stored; TTL removes old buckets.
 * key(req) groups requests, e.g. by IP or by IP + email for logins.
 */
export const rateLimit = ({ windowMs, max, key = (req) => req.ip, message = "Too many requests. Please wait a moment and try again." }) => {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
  }, windowMs);
  sweep.unref?.();

  return async (req, res, next) => {
    const now = Date.now();
    const id = key(req);
    let entry;
    if (isProduction()) {
      const resetAt = (Math.floor(now / windowMs) + 1) * windowMs;
      const bucketId = crypto.createHash("sha256").update(`${windowMs}|${max}|${message}|${id}|${resetAt}`).digest("hex");
      try {
        const update = { $inc: { hits: 1 }, $setOnInsert: { expiresAt: new Date(resetAt) } };
        let bucket;
        try { bucket = await RateLimitBucket.findOneAndUpdate({ _id: bucketId }, update, { upsert: true, returnDocument: "after" }); }
        catch (error) {
          if (error.code !== 11000) throw error;
          bucket = await RateLimitBucket.findOneAndUpdate({ _id: bucketId }, { $inc: { hits: 1 } }, { returnDocument: "after" });
        }
        if (!bucket) throw new Error("Rate limit counter unavailable.");
        entry = { count: bucket.hits, resetAt };
      } catch (error) { return next(error); }
    } else {
      entry = hits.get(id);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        hits.set(id, entry);
      }
      entry.count += 1;
    }
    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return fail(res, 429, message);
    }
    next();
  };
};

const MINUTE = 60 * 1000;
const loginMessage = "Too many sign-in requests from this network. Please wait 15 minutes and try again.";

// The account sending the request (read from its session cookie, so signing in again doesn't reset the
// count), or the network when there is none. A forged cookie can't store anything: the request still
// has to pass the real session check afterwards.
const accountKey = (req) => {
  const domain = req.get("X-Session-Domain");
  const token = ["customer", "agent", "admin"].includes(domain) ? req.cookies?.[`${domain}_token`] : null;
  const id = typeof token === "string" ? jwt.decode(token)?.id : null;
  return typeof id === "string" && /^[a-f\d]{24}$/i.test(id) ? `account:${id}` : `ip:${req.ip}`;
};

export const limits = {
  // Every API call: generous, only stops floods
  api: rateLimit({ windowMs: MINUTE, max: 300 }),
  // Separate flood protection; password failures use the shared 3-attempt/30-minute account lock.
  login: rateLimit({ windowMs: 15 * MINUTE, max: 40, message: loginMessage }),
  adminLogin: rateLimit({ windowMs: 15 * MINUTE, max: 20, message: loginMessage }),
  // Per network, not per person: many mobile users share one address (carrier NAT), so this only
  // stops floods. Each email address separately gets at most 5 codes an hour (utils/emailVerification.js).
  register: rateLimit({ windowMs: 60 * MINUTE, max: 30, message: "Too many sign-ups from this network. Please try again later." }),
  password: rateLimit({ windowMs: 15 * MINUTE, max: 5, message: "Too many password attempts. Please wait 15 minutes and try again." }),
  // Payment starts and checks, and things customers send to owners
  payments: rateLimit({ windowMs: 15 * MINUTE, max: 30 }),
  contact: rateLimit({ windowMs: 15 * MINUTE, max: 30, message: "You're sending a lot of requests. Please wait a few minutes and try again." }),
  // Chat messages: about 8 a minute on average, plenty for a real conversation, but no flooding
  // Counted per account (staff sharing an office connection each get their own allowance)
  messages: rateLimit({ windowMs: 15 * MINUTE, max: 120, key: accountKey, message: "You're sending messages very quickly. Please wait a few minutes and try again." }),
  // Property views: plenty for real browsing, stops scripts inflating counts with fresh visitor ids
  views: rateLimit({ windowMs: 15 * MINUTE, max: 120 }),
  // Browser security reports (one page can send several): enough to see problems, not a log flood
  cspReports: rateLimit({ windowMs: 15 * MINUTE, max: 30 }),
  // Place search is typed a letter at a time (debounced in the browser) and proxies a shared free service
  geo: rateLimit({ windowMs: MINUTE, max: 60, message: "Too many location searches. Please wait a moment and try again." }),
  // Connecting a hotel payout account checks the account password and calls Paystack. Per account,
  // so a stolen session can't be used to guess the password. Mount after the session guard.
  payout: rateLimit({ windowMs: 15 * MINUTE, max: 5, key: (req) => `payout:${req.user._id}`, message: "Too many payout account attempts. Please wait 15 minutes and try again." }),
  // Saving a listing, hotel rooms or an agent profile can upload photos to Cloudinary and look the
  // address up with the shared geocoder. Far above real editing; per account. Mount after the session guard.
  listingSaves: rateLimit({ windowMs: 15 * MINUTE, max: 60, key: (req) => `listing-save:${req.user._id}`, message: "You're saving changes very quickly. Please wait a few minutes and try again." }),
  // Server-rendered pages (outside /api) each read the database; crawlers slow down when they get 429
  pages: rateLimit({ windowMs: MINUTE, max: 120, message: "Too many page requests. Please wait a moment and try again." }),
  // A sitemap page can list up to 5,000 homes; crawlers need them only occasionally
  sitemaps: rateLimit({ windowMs: MINUTE, max: 20, message: "Too many sitemap requests. Please wait a moment and try again." }),
};

/**
 * JWT signing key check at startup. HS256 tokens can be attacked offline with guesses of the
 * key, so production refuses to start with a short key; development only warns.
 */
export const checkJwtKey = () => {
  const key = process.env.JWT_KEY || "";
  if (key.length >= 32) return true;
  const message = `JWT_KEY is too short (${key.length} characters). Use at least 32 random characters, e.g. node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`;
  if (isProduction()) {
    console.error(message);
    return false;
  }
  console.warn(`[security] ${message}`);
  return true;
};
