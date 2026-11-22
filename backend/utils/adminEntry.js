import crypto from "node:crypto";

// The admin console lives at a private address, https://<site>/<ADMIN_ENTRY_PATH>, that only the
// operators know. The browser sends that address with every admin request (X-Admin-Entry), and
// without it every admin endpoint answers exactly like an unknown one. Anyone who does not know the
// address can neither find the console nor reach the admin login to try passwords.
export const ADMIN_ENTRY_HEADER = "X-Admin-Entry";

const PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
// Public first path segments the console must never share
const RESERVED = ["admin", "agent", "agents", "account", "api", "login", "register", "house", "checkout", "payment", "make-offer", "offer", "sale", "rent", "contact", "properties", "listings"];

/** Why ADMIN_ENTRY_PATH is unusable, or "" when it is fine. */
export const adminEntryProblem = (value = process.env.ADMIN_ENTRY_PATH?.trim()) => {
  if (!value) return "ADMIN_ENTRY_PATH is not set, so the admin console is disabled.";
  if (!PATTERN.test(value)) return "ADMIN_ENTRY_PATH must be 16-64 letters, digits, '-' or '_' (no slashes).";
  if (RESERVED.includes(value.toLowerCase())) return "ADMIN_ENTRY_PATH must not be a public page name.";
  return "";
};

/** The private first path segment of the admin console, or null when the console is disabled (in every environment). */
export const adminEntryPath = () => {
  const value = process.env.ADMIN_ENTRY_PATH?.trim();
  return value && !adminEntryProblem(value) ? value : null;
};

const digest = (value) => crypto.createHash("sha256").update(value).digest();

// Constant-time comparison of a supplied value with the configured address
export const matchesAdminEntry = (received) => {
  const expected = adminEntryPath();
  return Boolean(expected && typeof received === "string" && crypto.timingSafeEqual(digest(expected), digest(received)));
};

// The address the browser sent with an admin request
export const hasAdminEntry = (req) => matchesAdminEntry(req.get(ADMIN_ENTRY_HEADER));

// Same response as any unknown API path, so probing reveals nothing
export const hideAdmin = (res) => res.status(404).json({ success: false, message: "Endpoint not found." });

export const requireAdminEntry = (req, res, next) => (hasAdminEntry(req) ? next() : hideAdmin(res));

export const checkAdminEntryConfig = () => {
  const problem = adminEntryProblem();
  if (problem) console.error(`Admin console: ${problem}`);
};
