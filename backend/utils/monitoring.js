import * as Sentry from "@sentry/node";

/**
 * Error monitoring with Sentry. Off unless SENTRY_DSN is set, so tests, local development and
 * deployments without a DSN send nothing.
 *
 * Privacy: no cookies, request bodies, headers, IP addresses or query strings are sent, and long
 * tokens in URLs (team invites, the admin console's private address) are replaced. Only the
 * method, a cleaned path, the error, and the signed-in account's internal id are reported.
 * No automatic instrumentation is installed: errors are reported explicitly by the app's error
 * handlers, which also suits serverless functions.
 */
let enabled = false;

// ObjectIds are kept (useful, not secret); other long opaque segments become ":token"
const LONG_TOKEN = /^[A-Za-z0-9_-]{20,}$/;
const OBJECT_ID = /^[a-f\d]{24}$/i;
export const cleanPath = (url = "") => {
  const path = String(url).split(/[?#]/)[0];
  const entry = process.env.ADMIN_ENTRY_PATH?.trim();
  return path.split("/").map((segment) => {
    if (entry && segment === entry) return ":admin";
    return LONG_TOKEN.test(segment) && !OBJECT_ID.test(segment) ? ":token" : segment;
  }).join("/");
};

// Removes anything personal or secret that an SDK integration might have attached
export const scrubEvent = (event) => {
  if (event.request) event.request = { method: event.request.method, url: event.request.url ? cleanPath(event.request.url) : undefined };
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined;
  delete event.server_name; // the function's host name: not useful, not needed
  for (const crumb of event.breadcrumbs || []) {
    if (crumb.data?.url) crumb.data.url = cleanPath(crumb.data.url);
    if (crumb.data) for (const key of Object.keys(crumb.data)) if (!["url", "method", "status_code"].includes(key)) delete crumb.data[key];
  }
  return event;
};

export const initMonitoring = () => {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (enabled || !dsn) return enabled;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    sendDefaultPii: false,
    defaultIntegrations: false, // explicit reports only (see above)
    beforeSend: scrubEvent,
    beforeBreadcrumb: (crumb) => (crumb.category === "console" ? null : crumb),
  });
  enabled = true;
  return enabled;
};

export const monitoringEnabled = () => enabled;

/**
 * Reports an unexpected error. `req` (optional) adds the method, cleaned path and account id.
 * Waits briefly for delivery, because a serverless function may be frozen after it responds.
 * Never throws: monitoring problems must not change what the user sees.
 */
export const reportError = async (error, { req, tags = {} } = {}) => {
  if (!enabled) return;
  try {
    Sentry.withScope((scope) => {
      if (req) {
        scope.setContext("request", { method: req.method, path: cleanPath(req.originalUrl || req.url) });
        if (req.user?._id) scope.setUser({ id: String(req.user._id) });
        if (req.sessionDomain) scope.setTag("session", req.sessionDomain);
      }
      for (const [key, value] of Object.entries(tags)) scope.setTag(key, String(value));
      Sentry.captureException(error);
    });
    await Sentry.flush(2000);
  } catch {
    // monitoring must never break the request
  }
};
