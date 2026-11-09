import { adminEntry } from "./adminEntry.js";

/**
 * Browser error monitoring with Sentry. Off unless VITE_SENTRY_DSN is set at build time; the
 * Sentry code is then downloaded separately, after the page has started, so visitors download
 * nothing extra when it is off.
 *
 * Privacy: no IP address, cookies, headers, console output or query strings are sent; the admin
 * console's private address and other long tokens in URLs are replaced.
 */
const DSN = import.meta.env?.VITE_SENTRY_DSN?.trim() || ""; // (no import.meta.env outside Vite, e.g. in tests)
let sentry = null; // Promise of the loaded SDK (or null when it failed to load)

const LONG_TOKEN = /^[A-Za-z0-9_-]{20,}$/;
const OBJECT_ID = /^[a-f\d]{24}$/i;

// "/<admin entry>/login?x=1" -> "/:admin/login"; keeps the origin of full URLs
export const cleanUrl = (url = "", entry = adminEntry()) => {
  const text = String(url).split(/[?#]/)[0];
  const origin = text.match(/^[a-z][a-z\d+.-]*:\/\/[^/]+/i)?.[0] || "";
  const path = text.slice(origin.length);
  return origin + path.split("/").map((segment) => {
    if (entry && segment === entry) return ":admin";
    return LONG_TOKEN.test(segment) && !OBJECT_ID.test(segment) ? ":token" : segment;
  }).join("/");
};

export const scrubEvent = (event) => {
  if (event.request) event.request = { url: event.request.url ? cleanUrl(event.request.url) : undefined };
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined;
  for (const crumb of event.breadcrumbs || []) {
    if (!crumb.data) continue;
    for (const key of ["url", "from", "to"]) if (crumb.data[key]) crumb.data[key] = cleanUrl(crumb.data[key]);
  }
  return event;
};

// Console messages can contain anything: never sent
export const scrubBreadcrumb = (crumb) => (crumb.category === "console" ? null : crumb);

// Called once the admin address is known (main.jsx), so it can be removed from every report
export const startMonitoring = () => {
  if (!DSN || sentry) return;
  sentry = import("@sentry/react")
    .then((Sentry) => {
      Sentry.init({
        dsn: DSN,
        environment: import.meta.env.MODE,
        sendDefaultPii: false,
        beforeSend: scrubEvent,
        beforeBreadcrumb: scrubBreadcrumb,
      });
      return Sentry;
    })
    .catch(() => null); // monitoring must never break the site
};

// Reports an error that React caught (uncaught errors are reported automatically once started)
export const reportError = (error) => {
  if (!DSN) return;
  startMonitoring();
  sentry?.then((Sentry) => Sentry?.captureException(error));
};
