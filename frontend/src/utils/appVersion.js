import { lazy } from "react";

/**
 * After a new deployment, a tab that is still running the previous build asks for code files
 * that no longer exist. These helpers recognise that failure and reload the page once,
 * which picks up the new build. A short guard stops a reload loop if the files are really missing.
 */
const KEY = "homebase:version-reload";
const GUARD_MS = 15000;

// Chrome/Edge, Safari and Firefox word the failed dynamic import differently
export const isOutdatedBuildError = (error) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(error?.message || String(error || ""));

// Reloads unless it already did so moments ago; returns whether a reload started
export const reloadForNewVersion = () => {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY)) || 0;
  } catch { /* storage unavailable: reload at most once per page view below */ }
  if (Date.now() - last < GUARD_MS || window.__homebaseReloading) return false;
  window.__homebaseReloading = true;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* still reload once */ }
  window.location.reload();
  return true;
};

// React.lazy for route pages: an outdated build reloads (keeping the loader on screen) instead of crashing
export const lazyPage = (load) =>
  lazy(() =>
    load().catch((error) => {
      if (isOutdatedBuildError(error) && reloadForNewVersion()) return new Promise(() => {});
      throw error;
    })
  );

// Vite reports failed preloads of a page's shared files with this event
export const watchForNewVersion = () => {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
};
