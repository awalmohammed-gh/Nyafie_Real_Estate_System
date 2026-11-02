// The admin console lives at a private address, /<ADMIN_ENTRY_PATH>, known only to the operators.
// Only a SHA-256 hash of it is built into the app (see vite.config.js), so the JavaScript does not
// reveal it: /admin and every other guess is an ordinary "page not found". The address is learned
// from the URL the admin typed, kept for this tab, and sent with admin API requests, where the
// server checks it again. The backend still authorizes every admin request on its own.
// typeof keeps this module usable outside Vite (backend tests import the session helpers)
const EXPECTED = typeof __ADMIN_ENTRY_HASH__ === "string" ? __ADMIN_ENTRY_HASH__ : "";
const STORAGE_KEY = "hb:admin-entry";
const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

let entry = null;

const sha256 = async (text) => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const isEntry = async (segment) => {
  if (!EXPECTED || typeof segment !== "string" || !SEGMENT.test(segment) || !globalThis.crypto?.subtle) return false;
  try { return (await sha256(segment)) === EXPECTED; } catch { return false; }
};

const readStored = () => { try { return sessionStorage.getItem(STORAGE_KEY); } catch { return null; } };
const store = (value) => { try { sessionStorage.setItem(STORAGE_KEY, value); } catch { /* private mode: this page load only */ } };

/** Runs once before the app loads: recognises the console's address in this URL or earlier in this tab. */
export const resolveAdminEntry = async (pathname = window.location.pathname) => {
  for (const candidate of [pathname.split("/")[1], readStored()]) {
    if (await isEntry(candidate)) {
      entry = candidate;
      store(candidate);
      return;
    }
  }
};

/** The console's first path segment, or null when this tab has not opened it. */
export const adminEntry = () => entry;

/** A console page: adminPath("/payments") -> "/<entry>/payments". Without an entry there is no console. */
export const adminPath = (path = "") => (entry ? `/${entry}${path}` : "/");

export const isAdminPath = (pathname) => Boolean(entry) && (pathname === `/${entry}` || pathname.startsWith(`/${entry}/`));

// Server notifications use the canonical /admin/... form; show them at the private address
export const resolveAdminLink = (link) => (typeof link === "string" && /^\/admin(?=\/|$|\?)/.test(link) ? adminPath(link.slice(6)) : link);
