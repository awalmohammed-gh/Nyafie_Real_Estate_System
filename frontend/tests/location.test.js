import { test } from "node:test";
import assert from "node:assert/strict";
import { approximate, compactPrice, describeSearchArea, formatDistance, hasMapPin, nearToParams, parseNear, parseRadius, widerRadius, zoomForRadius } from "../src/utils/geo.js";
import { mapProperty } from "../src/frontApi/mappers.js";

test("distances read naturally", () => {
  assert.equal(formatDistance(20), "Under 50 m away");
  assert.equal(formatDistance(497), "500 m away");
  assert.equal(formatDistance(1000), "1 km away");
  assert.equal(formatDistance(1234), "1.2 km away");
  assert.equal(formatDistance(3550), "3.6 km away");
  assert.equal(formatDistance(12400), "12 km away");
  for (const bad of [null, undefined, -5, NaN, "far"]) assert.equal(formatDistance(bad), "");
});

test("the search location comes from the URL; the device position never does", () => {
  const params = (query) => new URLSearchParams(query);
  assert.equal(parseNear(params(""), null), null);
  assert.deepEqual(parseNear(params("near=me"), null), { source: "device", pending: true, label: "your location", radius: 5 });
  assert.deepEqual(parseNear(params("near=me&radius=10"), { latitude: 5.635512, longitude: -0.161734 }), { source: "device", latitude: 5.636, longitude: -0.162, label: "your location", radius: 10 });
  assert.deepEqual(parseNear(params("near=5.6355,-0.1617&place=East%20Legon,%20Accra&radius=2"), null), { source: "place", latitude: 5.6355, longitude: -0.1617, label: "East Legon, Accra", radius: 2 });
  assert.equal(parseNear(params("near=95,0"), null), null, "impossible coordinates are ignored");
  assert.equal(parseNear(params("near=abc"), null), null);
  assert.equal(parseNear(params("near=5.6,-0.1&radius=3"), null).radius, 5, "only offered radii are used");
  assert.equal(parseNear(params("near=5.6,-0.1"), null).label, "the selected place");

  assert.deepEqual(nearToParams({ source: "device", latitude: 5.6, longitude: -0.1 }), { near: "me", place: "" }, "device coordinates are never written to the URL");
  assert.deepEqual(nearToParams({ source: "place", latitude: 5.6355123, longitude: -0.1617456, label: "East Legon" }), { near: "5.63551,-0.16175", place: "East Legon" });
});

test("radius, price and map helpers", () => {
  assert.equal(parseRadius("20"), 20);
  assert.equal(parseRadius("7"), 5);
  assert.equal(widerRadius(5), 10);
  assert.equal(widerRadius(50), null);
  assert.equal(zoomForRadius(1), 15);
  assert.equal(approximate(5.63551), 5.636);
  assert.equal(describeSearchArea({ radius: 5, label: "Madina" }), "within 5 km of Madina");
  assert.equal(compactPrice(950), "₵950");
  assert.equal(compactPrice(3200, { period: "month" }), "₵3.2k/mo");
  assert.equal(compactPrice(650000), "₵650k");
  assert.equal(compactPrice(1250000), "₵1.3M");
  assert.equal(compactPrice(450, { period: "night", currency: "USD" }), "USD 450/night");
  assert.equal(hasMapPin({ location: { latitude: 5.6, longitude: -0.1 } }), true);
  assert.equal(hasMapPin({ location: { latitude: null, longitude: null } }), false);
  assert.equal(hasMapPin({}), false);
});

test("nearby results keep the server's distance on each card", () => {
  const base = { id: "p1", title: "Flat", listingType: "Rent", pricePeriod: "month", price: 3000, location: {}, images: [] };
  assert.equal(mapProperty({ ...base, distance: 1230 }).distance, 1230);
  assert.equal(mapProperty(base).distance, null);
});

// ---------- The visitor location store, with a fake browser ----------
const memoryStorage = (fail = false) => {
  const data = new Map();
  return {
    data,
    getItem: (key) => { if (fail) throw new Error("blocked"); return data.has(key) ? data.get(key) : null; },
    setItem: (key, value) => { if (fail) throw new Error("blocked"); data.set(key, String(value)); },
    removeItem: (key) => { if (fail) throw new Error("blocked"); data.delete(key); },
  };
};
let fresh = 0;
const browser = async (t, { permission = "prompt", position, error, storageFails = false, saved = {} } = {}) => {
  const previous = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator") };
  const local = memoryStorage(storageFails), session = memoryStorage(storageFails);
  for (const [key, value] of Object.entries(saved.local || {})) local.data.set(key, JSON.stringify(value));
  for (const [key, value] of Object.entries(saved.session || {})) session.data.set(key, JSON.stringify(value));
  const calls = { position: 0, options: null };
  const navigator = {
    permissions: { query: async ({ name }) => { assert.equal(name, "geolocation"); return { state: permission }; } },
    geolocation: {
      getCurrentPosition: (ok, fail, options) => {
        calls.position += 1;
        calls.options = options;
        setTimeout(() => (error ? fail({ code: error }) : ok({ coords: position })), 5);
      },
    },
  };
  globalThis.localStorage = local;
  globalThis.sessionStorage = session;
  Object.defineProperty(globalThis, "navigator", { value: navigator, configurable: true, writable: true });
  t.after(() => {
    globalThis.localStorage = previous.localStorage;
    globalThis.sessionStorage = previous.sessionStorage;
    if (previous.navigator) Object.defineProperty(globalThis, "navigator", previous.navigator); else delete globalThis.navigator;
  });
  // A fresh copy of the module for each scenario, as on a new page load
  const store = await import(`../src/utils/visitorLocation.js?scenario=${++fresh}`);
  return { store, local, session, calls };
};

test("sharing a location keeps only an approximate position, in this tab", async (t) => {
  const { store, local, session, calls } = await browser(t, { position: { latitude: 5.635512, longitude: -0.161734, accuracy: 12 } });
  assert.equal(store.getSnapshot().status, "idle");
  const [first, second] = await Promise.all([store.requestDevicePosition(), store.requestDevicePosition()]);
  assert.equal(calls.position, 1, "simultaneous requests share one browser prompt");
  assert.deepEqual(first, { latitude: 5.636, longitude: -0.162 });
  assert.deepEqual(second, first);
  assert.equal(calls.options.enableHighAccuracy, false);
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.choice, "device");
  const stored = session.data.get("nyafie.location.position");
  assert.doesNotMatch(stored, /5\.6355|0\.1617/, "the precise position is never stored");
  assert.deepEqual(JSON.parse(stored).latitude, 5.636);
  assert.equal([...local.data.values()].some((value) => value.includes("5.63")), false, "no position in long-lived storage");
  assert.equal(local.data.get("nyafie.location.choice"), '"device"');
  store.forgetPosition();
  assert.equal(store.getSnapshot().position, null);
  assert.equal(session.data.has("nyafie.location.position"), false);
});

test("a location permission the visitor refused is never asked for again", async (t) => {
  const { store, calls, local } = await browser(t, { permission: "denied" });
  assert.equal(await store.requestDevicePosition(), null);
  assert.equal(calls.position, 0, "the browser isn't asked");
  assert.equal(store.getSnapshot().status, "denied");
  assert.equal(local.data.get("nyafie.location.choice"), '"denied"');
  assert.match(store.LOCATION_PROBLEMS.denied, /Search for a location manually/);
});

test("refusing, timing out and unavailable positions each explain what to do", async (t) => {
  for (const [code, status] of [[1, "denied"], [2, "unavailable"], [3, "timeout"]]) {
    const { store } = await browser(t, { error: code });
    assert.equal(await store.requestDevicePosition(), null);
    assert.equal(store.getSnapshot().status, status);
    assert.ok(store.LOCATION_PROBLEMS[status]);
  }
});

test("the choice and last searched place are remembered; old positions expire", async (t) => {
  const recent = { latitude: 5.636, longitude: -0.162, at: Date.now() - 5 * 60 * 1000 };
  const { store } = await browser(t, { saved: { local: { "nyafie.location.choice": "manual", "nyafie.location.place": { label: "Madina", latitude: 5.68, longitude: -0.17 } }, session: { "nyafie.location.position": recent } } });
  assert.deepEqual(store.getSnapshot(), { status: "ready", position: { latitude: 5.636, longitude: -0.162 }, choice: "manual", place: { label: "Madina", latitude: 5.68, longitude: -0.17 } });
  const expired = await browser(t, { saved: { session: { "nyafie.location.position": { ...recent, at: Date.now() - 31 * 60 * 1000 } }, local: { "nyafie.location.choice": "unknown" } } });
  assert.equal(expired.store.getSnapshot().position, null);
  assert.equal(expired.store.getSnapshot().status, "idle");
  assert.equal(expired.store.getSnapshot().choice, null, "unknown stored values are ignored");
  expired.store.rememberPlace({ label: "Tema", latitude: 999, longitude: 0 });
  assert.equal(expired.store.getSnapshot().place, null, "invalid places are not kept");
});

test("blocked storage never breaks location search", async (t) => {
  const { store } = await browser(t, { storageFails: true, position: { latitude: 5.6, longitude: -0.2 } });
  assert.deepEqual(await store.requestDevicePosition(), { latitude: 5.6, longitude: -0.2 });
  store.setChoice("skip");
  store.rememberPlace({ label: "Kasoa", latitude: 5.53, longitude: -0.44 });
  assert.equal(store.getSnapshot().choice, "skip");
  assert.equal(store.getSnapshot().place.label, "Kasoa");
});

test("browsers without geolocation fall back to manual search", async (t) => {
  const { store } = await browser(t);
  delete globalThis.navigator.geolocation;
  assert.equal(await store.requestDevicePosition(), null);
  assert.equal(store.getSnapshot().status, "unsupported");
  assert.equal(await store.permissionState(), "unsupported");
});
