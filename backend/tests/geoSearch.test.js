import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { clearGeocodeCache, toPlace } from "../controllers/geoController.js";

const feature = (name, type, [longitude, latitude], extra = {}) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [longitude, latitude] },
  properties: { osm_type: "N", osm_id: Math.round(Math.abs(latitude * 1e6)), name, type, state: "Greater Accra Region", country: "Ghana", countrycode: "GH", ...extra },
});
const PHOTON = {
  features: [
    feature("East Legon", "district", [-0.1617, 5.6355], { city: "Accra" }),
    feature("East Legon", "house", [-0.1508, 5.6483], { osm_value: "bus_stop", locality: "East Legon Extension" }),
    feature("East Legon Hills", "district", [-0.1005, 5.6928]),
    feature("East Legon", "district", [-0.1617, 5.6355], { city: "Accra", osm_id: 99 }), // duplicate label
  ],
};

test("place search proxies the geocoder with validation, filtering, caching and safe failures", async (t) => {
  clearGeocodeCache();
  const saved = process.env.GEOCODER_URL;
  delete process.env.GEOCODER_URL;
  t.after(() => { if (saved === undefined) delete process.env.GEOCODER_URL; else process.env.GEOCODER_URL = saved; clearGeocodeCache(); });
  const realFetch = globalThis.fetch;
  const calls = [];
  let answer = () => ({ ok: true, json: async () => PHOTON });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://photon.komoot.io/")) return realFetch(url, options);
    calls.push({ url: new URL(url), options });
    return answer();
  });
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const search = async (params) => {
    const response = await realFetch(`http://127.0.0.1:${server.address().port}/api/geo/search?${new URLSearchParams(params)}`);
    return { status: response.status, cache: response.headers.get("cache-control"), ...(await response.json()) };
  };

  await t.test("public place search returns areas, not bus stops, without duplicates", async () => {
    const body = await search({ q: "  East   Legon " });
    assert.equal(body.status, 200);
    assert.deepEqual(body.data.map((place) => place.label), ["East Legon, Accra", "East Legon Hills, Greater Accra Region"]);
    assert.deepEqual(body.data[0], { id: "N5635500", name: "East Legon", description: "Accra, Greater Accra Region, Ghana", label: "East Legon, Accra", latitude: 5.6355, longitude: -0.1617, type: "district", countryCode: "GH" });
    const sent = calls[0].url;
    assert.equal(sent.searchParams.get("q"), "East Legon");
    assert.equal(sent.searchParams.get("lat"), "7.95", "ranked around Ghana by default");
    assert.match(calls[0].options.headers["User-Agent"], /property search/);
    assert.doesNotMatch(calls[0].options.headers["User-Agent"], /@/, "no personal contact details are sent");
  });

  await t.test("identical searches are answered from the cache", async () => {
    const before = calls.length;
    assert.equal((await search({ q: "east legon" })).data.length, 2);
    assert.equal(calls.length, before);
  });

  await t.test("address search for the listing editor keeps landmarks", async () => {
    const body = await search({ q: "East Legon", purpose: "address" });
    assert.equal(body.data.length, 3);
    assert.ok(body.data.some((place) => place.type === "house"));
  });

  await t.test("a nearby bias is coarsened before it leaves the server", async () => {
    await search({ q: "Madina", latitude: "5.683412", longitude: "-0.165509" });
    const sent = calls.at(-1).url;
    assert.equal(sent.searchParams.get("lat"), "5.7");
    assert.equal(sent.searchParams.get("lon"), "-0.2");
  });

  await t.test("too short or too long queries are refused before any request", async () => {
    const before = calls.length;
    for (const q of ["", "a", "x".repeat(101)]) assert.equal((await search({ q })).status, 400);
    assert.equal(calls.length, before);
  });

  await t.test("geocoder outages and bad answers fail safely and are not cached", async () => {
    answer = () => ({ ok: false, status: 502, json: async () => ({}) });
    const down = await search({ q: "Spintex" });
    assert.equal(down.status, 503);
    assert.match(down.message, /unavailable right now/);
    assert.equal(down.cache, "no-store");
    answer = () => { throw new Error("network down"); };
    assert.equal((await search({ q: "Spintex" })).status, 503);
    answer = () => ({ ok: true, json: async () => ({ features: "nope" }) });
    assert.deepEqual((await search({ q: "Spintex" })).data, []);
    answer = () => ({ ok: true, json: async () => PHOTON });
    assert.equal((await search({ q: "Tema" })).data.length, 2);
  });

  await t.test("malformed features are skipped", () => {
    assert.equal(toPlace({ properties: { name: "Nowhere" }, geometry: { coordinates: ["x", 1] } }), null);
    assert.equal(toPlace({ properties: {}, geometry: { coordinates: [0, 0] } }), null);
    assert.equal(toPlace(null), null);
  });
});
