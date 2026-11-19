/*
 * Makes the site installable as an app and keeps it usable on weak connections, WITHOUT ever
 * serving an out-of-date page:
 *  - pages: always fetched from the network; only when that fails is the offline page shown
 *  - /assets/*: Vite's files have a content hash in their name and never change, so a stored copy
 *    is always correct and loads instantly
 *  - the API, other sites (images, fonts, payments) and anything else: untouched
 * To switch this off after a bad release, ship a sw.js that unregisters itself.
 */
const VERSION = "v1";
const SHELL = `nyafie-shell-${VERSION}`;
const ASSETS = "nyafie-assets"; // hashed files are valid forever, so this cache survives versions
const OFFLINE_URL = "/offline.html";
const MAX_ASSETS = 150;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("nyafie-shell-") && key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Oldest entries go first once the cache holds more than MAX_ASSETS files (old releases' files)
const trim = async (cache) => {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)));
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const stored = await cache.match(request);
        if (stored) return stored;
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          await cache.put(request, response.clone());
          trim(cache);
        }
        return response;
      }),
    );
  }
});
