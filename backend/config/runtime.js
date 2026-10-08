const production = () => process.env.NODE_ENV === "production";

export const normalizeOrigin = (value) => {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return "";
    return url.origin;
  } catch { return ""; }
};

export const siteUrl = () => {
  const value = process.env.PUBLIC_SITE_URL || process.env.CLIENT_URL?.split(",")[0] || (!production() ? "http://localhost:5173" : "");
  const origin = normalizeOrigin(value);
  if (!origin || (production() && !origin.startsWith("https://"))) throw new Error("Set PUBLIC_SITE_URL to a single HTTPS production origin.");
  return origin;
};

export const clientOrigins = () => [...new Set([
  ...(process.env.CLIENT_URL || siteUrl()).split(",").map((value) => normalizeOrigin(value.trim())),
  siteUrl(),
  // Vite binds to 127.0.0.1; both loopback names are valid for local development.
  ...(!production() ? ["http://localhost:5173", "http://127.0.0.1:5173"] : []),
  ...(process.env.VERCEL_ENV === "preview" ? [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean).map((host) => normalizeOrigin(`https://${host}`)) : []),
].filter(Boolean))];

export const paymentReturnUrl = (req) => {
  const origin = normalizeOrigin(req.get?.("Origin"));
  return (!production() || process.env.VERCEL_ENV === "preview") && clientOrigins().includes(origin) ? origin : siteUrl();
};

export const validateRuntimeConfig = () => {
  for (const key of ["MONGODB_URI", "JWT_KEY", "CLOUD_NAME", "CLOUD_API_KEY", "CLOUD_SECRET_KEY"]) {
    if (!process.env[key]?.trim()) throw new Error(`${key} is required on the backend service.`);
  }
  if (production()) {
    if (!process.env.PUBLIC_SITE_URL) throw new Error("PUBLIC_SITE_URL is required in production.");
    if (process.env.JWT_KEY.length < 32) throw new Error("JWT_KEY must contain at least 32 random characters in production.");
    if ((process.env.CLIENT_URL || siteUrl()).split(",").some((value) => !normalizeOrigin(value.trim()).startsWith("https://"))) throw new Error("Production CLIENT_URL must contain valid HTTPS origins without paths.");
  }
  if (process.env.COOKIE_SAME_SITE && !["lax", "strict", "none"].includes(process.env.COOKIE_SAME_SITE)) throw new Error("COOKIE_SAME_SITE must be lax, strict or none.");
  siteUrl();
};
