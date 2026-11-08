import { siteName } from "../models/Setting.js";
import { siteUrl } from "../config/runtime.js";
import { ok, fail } from "../utils/response.js";
import { parseCenter } from "../utils/geo.js";

/**
 * Place search for "search by city, neighbourhood or location" and the listing editor's map.
 * Proxies an OpenStreetMap geocoder (Photon by default; GEOCODER_URL can point to a self-hosted
 * or paid Photon-compatible service) so browsers never call it directly, and answers are cached.
 * Queries are not logged or stored beyond the in-memory cache.
 */
const DEFAULT_GEOCODER = "https://photon.komoot.io/api";
// Ghana's centre: results here rank higher, but places elsewhere are still found
const DEFAULT_BIAS = { latitude: 7.95, longitude: -1.03, zoom: 7 };
// Public place search returns areas and streets; the editor ("address") also gets buildings and landmarks
const PLACE_TYPES = new Set(["country", "state", "county", "city", "district", "locality", "street"]);
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_SIZE = 500;
const cache = new Map();

export const clearGeocodeCache = () => cache.clear();

const remember = (key, value) => {
  cache.delete(key);
  cache.set(key, { value, expires: Date.now() + CACHE_TTL });
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
};
const recall = (key) => {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) { cache.delete(key); return undefined; }
  return hit.value;
};

const text = (value) => String(value || "").trim();
const unique = (values) => values.map(text).filter((value, index, all) => value && all.indexOf(value) === index);

// One Photon GeoJSON feature -> { id, name, description, label, latitude, longitude, type }
export const toPlace = (feature) => {
  const p = feature?.properties || {};
  const [longitude, latitude] = feature?.geometry?.coordinates || [];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const name = text(p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.name || p.street);
  if (!name) return null;
  const context = unique([p.district, p.locality, p.city, p.county, p.state, p.country]).filter((part) => part !== name);
  return {
    id: `${p.osm_type || "x"}${p.osm_id || `${latitude},${longitude}`}`,
    name,
    description: context.slice(0, 3).join(", "),
    label: unique([name, p.city || p.locality || p.district, p.city ? "" : p.state]).join(", "),
    latitude: Math.round(latitude * 1e6) / 1e6,
    longitude: Math.round(longitude * 1e6) / 1e6,
    type: text(p.type) || "place",
    countryCode: text(p.countrycode).toUpperCase(),
  };
};

// GET /api/geo/search?q=East+Legon&purpose=place|address[&latitude&longitude to rank nearby places first]
export const searchPlaces = async (req, res) => {
  const q = text(req.query.q).replace(/\s+/g, " ");
  if (q.length < 2 || q.length > 100) return fail(res, 400, "Type at least 2 characters to search for a place.");
  const purpose = req.query.purpose === "address" ? "address" : "place";
  const near = parseCenter(req.query);
  // A rough bias only (about 11 km), so the cache is shared and no precise position leaves the server
  const bias = near ? { latitude: Math.round(near.latitude * 10) / 10, longitude: Math.round(near.longitude * 10) / 10, zoom: 10 } : DEFAULT_BIAS;
  const key = `${purpose}|${q.toLowerCase()}|${bias.latitude},${bias.longitude}`;
  const cached = recall(key);
  res.set("Cache-Control", "public, max-age=3600");
  if (cached) return ok(res, cached);

  let body;
  try {
    // A paid geocoder's URL can carry its API key, so the URL and error details (which can quote it)
    // never appear in a response or a log line: only a short reason does.
    const url = new URL(process.env.GEOCODER_URL?.trim() || DEFAULT_GEOCODER);
    for (const [name, value] of Object.entries({ q, limit: 12, lang: "en", lat: bias.latitude, lon: bias.longitude, zoom: bias.zoom, location_bias_scale: 0.3 })) url.searchParams.set(name, String(value));
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": `${siteName()} property search (${siteUrl()})` },
      signal: AbortSignal.timeout(6000),
      redirect: "error", // a key in the URL is never forwarded to another host
    });
    if (!response.ok) throw Object.assign(new Error("bad status"), { reason: `status ${response.status}` });
    body = await response.json();
  } catch (error) {
    const reason = error.reason || (error.name === "TimeoutError" ? "timeout" : error.code === "ERR_INVALID_URL" ? "GEOCODER_URL is not a valid URL" : error.name === "SyntaxError" ? "invalid JSON" : "network error");
    console.warn(`[geo] place search unavailable: ${reason}`);
    res.set("Cache-Control", "no-store");
    return fail(res, 503, "Location search is unavailable right now. Please try again in a moment.");
  }

  const seen = new Set();
  const places = (Array.isArray(body?.features) ? body.features : [])
    .filter((feature) => purpose === "address" || PLACE_TYPES.has(feature?.properties?.type))
    .map(toPlace)
    .filter((place) => place && !seen.has(place.label.toLowerCase()) && seen.add(place.label.toLowerCase()))
    .slice(0, 8);
  remember(key, places);
  ok(res, places);
};
