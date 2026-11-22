import { adminEntry, isAdminPath } from "./adminEntry.js";
import { forgetInstallPrompt } from "./pwa.js";

/**
 * Three installable apps share one site and one service worker (public/sw.js), each with its own
 * name, start page and scope, so they install side by side:
 *  - the site:            /manifest.webmanifest (scope /)
 *  - the agent workspace: /agent.webmanifest (scope /agent/), also named by the server on agent pages
 *  - the admin console:   /api/apps/<private address>/manifest.webmanifest (scope /<private address>/).
 *    Its address is never in the JavaScript or in any public page, so only someone already at the
 *    console (who knows the address) gets this app, and the server answers nothing for other addresses.
 */
export const appManifestFor = (pathname) => {
  if (isAdminPath(pathname)) return `/api/apps/${adminEntry()}/manifest.webmanifest`;
  if (/^\/agent(\/|$)/.test(pathname)) return "/agent.webmanifest";
  return "/manifest.webmanifest";
};

// Points the page's <link rel="manifest"> at the app for this address; the browser then offers that app
// Switching apps drops the browser's earlier install offer, which was for the previous app (utils/pwa.js)
export const applyAppManifest = (pathname, doc = globalThis.document, onSwitch = forgetInstallPrompt) => {
  const link = doc?.querySelector('link[rel="manifest"]');
  const href = appManifestFor(pathname);
  if (link && link.getAttribute("href") !== href) {
    link.setAttribute("href", href);
    onSwitch();
  }
  return href;
};
