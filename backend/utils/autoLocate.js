import { geocode } from "../controllers/geoController.js";

/**
 * Puts listings on the map from their address when nobody has placed a pin, so they appear in
 * nearby search straight away. These pins are approximate (the area, not the building), are
 * marked pinSource "address", and give way to any pin an agent or admin places by hand.
 */
const clean = (value) => String(value ?? "").trim();
const COUNTRY_CODES = { ghana: "GH" };
const ADDRESS_KEYS = ["neighbourhood", "city", "region", "country"];

// "East Legon, Accra", then the area or city on its own, most specific first
export const addressQueries = (location = {}) => {
  const area = clean(location.neighbourhood), city = clean(location.city), country = clean(location.country) || "Ghana";
  const queries = [];
  if (area && city && area.toLowerCase() !== city.toLowerCase()) queries.push(`${area}, ${city}`);
  if (area) queries.push(`${area}, ${country}`);
  if (city) queries.push(`${city}, ${country}`);
  return [...new Set(queries)];
};

/**
 * The area's coordinates from the listing's address, or null when it can't be found (or the
 * geocoder is unavailable: the listing is then saved without a pin, never with a guess).
 */
export const locateFromAddress = async (location = {}, { throwIfUnavailable = false } = {}) => {
  const code = COUNTRY_CODES[(clean(location.country) || "Ghana").toLowerCase()];
  for (const query of addressQueries(location)) {
    let places;
    // throwIfUnavailable lets a batch job retry later instead of reading "busy" as "not found"
    try { places = await geocode(query, { purpose: "place" }); } catch (error) { if (throwIfUnavailable) throw error; return null; }
    const match = places.find((place) => !code || place.countryCode === code);
    if (match) return { latitude: match.latitude, longitude: match.longitude, label: match.label, query };
  }
  return null;
};

// What the location looked like before an edit (call before the edit is applied)
export const locationSnapshot = (location) => {
  const plain = typeof location?.toObject === "function" ? location.toObject() : { ...(location || {}) };
  return Object.fromEntries(["latitude", "longitude", "pinSource", ...ADDRESS_KEYS].map((key) => [key, plain[key] ?? null]));
};

/**
 * Decides latitude, longitude and pinSource for a save. Returns the values to write.
 *  - New or moved coordinates           -> placed by a person: pinSource "map"
 *  - Coordinates kept as they were      -> unchanged (an approximate pin follows an address change)
 *  - No coordinates                     -> located from the address: pinSource "address"
 */
export const settleLocation = async (location = {}, before = null) => {
  const latitude = location.latitude, longitude = location.longitude;
  const hasPin = Number.isFinite(latitude) && Number.isFinite(longitude);
  const moved = hasPin && (before?.latitude !== latitude || before?.longitude !== longitude);
  if (moved) return { latitude, longitude, pinSource: "map" };
  const addressChanged = Boolean(before) && ADDRESS_KEYS.some((key) => clean(before[key]).toLowerCase() !== clean(location[key]).toLowerCase());
  if (hasPin && !(before?.pinSource === "address" && addressChanged)) return { latitude, longitude, pinSource: before?.pinSource ?? undefined };
  const found = await locateFromAddress(location);
  if (found) return { latitude: found.latitude, longitude: found.longitude, pinSource: "address" };
  // Not found: no pin. (An old approximate pin would now point at the previous address's area.)
  return { latitude: null, longitude: null, pinSource: undefined };
};
