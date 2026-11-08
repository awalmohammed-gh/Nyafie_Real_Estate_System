import { test } from "node:test";
import assert from "node:assert/strict";
import { clearGeocodeCache } from "../controllers/geoController.js";
import { addressQueries, locateFromAddress, locationSnapshot, settleLocation } from "../utils/autoLocate.js";

const place = (name, [longitude, latitude], countrycode = "GH", type = "district") => ({ geometry: { coordinates: [longitude, latitude] }, properties: { osm_type: "R", osm_id: Math.round(latitude * 1e4), name, type, city: "Accra", country: "Ghana", countrycode } });
const GAZETTEER = {
  "east legon, accra": [place("East Legon", [-0.1617, 5.6355])],
  "spintex, accra": [place("Spintex", [-0.0902, 5.6288], "GH", "locality")],
  "madina, accra": [],
  "madina, ghana": [place("Madina", [-0.1677, 5.6865], "GH", "city")],
  "osu, accra": [place("Osu", [-0.1824, 5.5606])],
  "victoria island, lagos": [place("Victoria Island", [3.42, 6.43], "NG")],
  "victoria island, ghana": [],
  "lagos, ghana": [],
};

const fakeGeocoder = (t, { down = false } = {}) => {
  clearGeocodeCache();
  const saved = process.env.GEOCODER_URL;
  delete process.env.GEOCODER_URL;
  t.after(() => { if (saved === undefined) delete process.env.GEOCODER_URL; else process.env.GEOCODER_URL = saved; clearGeocodeCache(); });
  const asked = [];
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async (url) => {
    const q = new URL(url).searchParams.get("q").toLowerCase();
    asked.push(q);
    if (down) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, json: async () => ({ features: GAZETTEER[q] || [] }) };
  });
  return asked;
};

test("address queries go from most to least specific", () => {
  assert.deepEqual(addressQueries({ neighbourhood: "East Legon", city: "Accra" }), ["East Legon, Accra", "East Legon, Ghana", "Accra, Ghana"]);
  assert.deepEqual(addressQueries({ neighbourhood: "Kumasi", city: "Kumasi" }), ["Kumasi, Ghana"]);
  assert.deepEqual(addressQueries({ city: "Tema", country: "Ghana" }), ["Tema, Ghana"]);
  assert.deepEqual(addressQueries({}), []);
});

test("listings are found from their neighbourhood, inside their country only", async (t) => {
  const asked = fakeGeocoder(t);
  assert.deepEqual(await locateFromAddress({ neighbourhood: "East Legon", city: "Accra" }), { latitude: 5.6355, longitude: -0.1617, label: "East Legon, Accra", query: "East Legon, Accra" });
  assert.equal((await locateFromAddress({ neighbourhood: "Madina", city: "Accra" })).query, "Madina, Ghana", "falls back to a wider query");
  assert.equal(await locateFromAddress({ neighbourhood: "Victoria Island", city: "Lagos", country: "Ghana" }), null, "a place in another country is not used");
  assert.equal(await locateFromAddress({}), null, "no address, no guess");
  assert.ok(asked.length >= 4);
});

test("an unavailable geocoder never invents a location", async (t) => {
  fakeGeocoder(t, { down: true });
  assert.equal(await locateFromAddress({ neighbourhood: "East Legon", city: "Accra" }), null);
  await assert.rejects(locateFromAddress({ neighbourhood: "Osu", city: "Accra" }, { throwIfUnavailable: true }), (error) => error.reason === "status 503", "batch jobs can tell busy from not found");
  assert.deepEqual(await settleLocation({ neighbourhood: "East Legon", city: "Accra", latitude: null, longitude: null }), { latitude: null, longitude: null, pinSource: undefined });
});

test("saving decides between a placed pin, an address pin and no pin", async (t) => {
  fakeGeocoder(t);
  const address = { neighbourhood: "East Legon", city: "Accra", region: "Greater Accra", country: "Ghana" };

  // New listing without a pin: located from the address (approximate)
  assert.deepEqual(await settleLocation({ ...address, latitude: null, longitude: null }, null), { latitude: 5.6355, longitude: -0.1617, pinSource: "address" });
  // New listing with a pin someone placed: exact
  assert.deepEqual(await settleLocation({ ...address, latitude: 5.64, longitude: -0.16 }, null), { latitude: 5.64, longitude: -0.16, pinSource: "map" });

  const autoPinned = { ...address, latitude: 5.6355, longitude: -0.1617, pinSource: "address" };
  // Edited without touching the pin: unchanged, still approximate
  assert.deepEqual(await settleLocation({ ...address, latitude: 5.6355, longitude: -0.1617 }, locationSnapshot(autoPinned)), { latitude: 5.6355, longitude: -0.1617, pinSource: "address" });
  // The agent dragged the approximate pin: now exact
  assert.deepEqual(await settleLocation({ ...address, latitude: 5.6371, longitude: -0.1650 }, locationSnapshot(autoPinned)), { latitude: 5.6371, longitude: -0.165, pinSource: "map" });
  // The address moved to another area: the approximate pin follows it
  assert.deepEqual(await settleLocation({ ...address, neighbourhood: "Spintex", latitude: 5.6355, longitude: -0.1617 }, locationSnapshot(autoPinned)), { latitude: 5.6288, longitude: -0.0902, pinSource: "address" });
  // ...and is removed if the new area can't be found, rather than pointing at the old one
  assert.deepEqual(await settleLocation({ ...address, neighbourhood: "Nowhere Estate", city: "Nowhere", latitude: 5.6355, longitude: -0.1617 }, locationSnapshot(autoPinned)), { latitude: null, longitude: null, pinSource: undefined });

  // A pin a person placed never moves because the address text changed
  const exact = { ...address, latitude: 5.6401, longitude: -0.1702, pinSource: "map" };
  assert.deepEqual(await settleLocation({ ...address, neighbourhood: "Osu", latitude: 5.6401, longitude: -0.1702 }, locationSnapshot(exact)), { latitude: 5.6401, longitude: -0.1702, pinSource: "map" });
  // Older pins (typed coordinates, no source) count as exact
  const legacy = { ...address, latitude: 5.61, longitude: -0.2 };
  assert.deepEqual(await settleLocation({ ...address, neighbourhood: "Osu", latitude: 5.61, longitude: -0.2 }, locationSnapshot(legacy)), { latitude: 5.61, longitude: -0.2, pinSource: undefined });
  // "Remove pin" on an approximate listing puts it back at its area
  assert.deepEqual(await settleLocation({ ...address, latitude: null, longitude: null }, locationSnapshot(exact)), { latitude: 5.6355, longitude: -0.1617, pinSource: "address" });
});
