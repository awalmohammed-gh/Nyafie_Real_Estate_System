// Location helpers shared by nearby search and place search.

export const SEARCH_RADII_KM = [1, 2, 5, 10, 20, 50];
export const DEFAULT_RADIUS_KM = 5;
const EARTH_RADIUS_KM = 6378.1;

const coordinate = (raw, min, max) => {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
};

/**
 * The search centre from ?latitude=&longitude= (or lat/lng). Rounded to 4 decimals (about 11 m):
 * precise enough for a 1 km search, and the server never handles a sharper position than that.
 */
export const parseCenter = (query) => {
  const latitude = coordinate(query.latitude ?? query.lat, -90, 90);
  const longitude = coordinate(query.longitude ?? query.lng ?? query.lon, -180, 180);
  if (latitude === null || longitude === null) return null;
  return { latitude: Math.round(latitude * 1e4) / 1e4, longitude: Math.round(longitude * 1e4) / 1e4 };
};

// Only the radii the interface offers; anything else is refused rather than silently changed
export const parseRadius = (raw) => {
  if (raw === undefined || raw === "") return DEFAULT_RADIUS_KM;
  const value = Number(raw);
  return SEARCH_RADII_KM.includes(value) ? value : null;
};

// $geoWithin uses radians: distance / Earth's radius
export const withinRadius = ({ latitude, longitude }, radiusKm) => ({
  $geoWithin: { $centerSphere: [[longitude, latitude], radiusKm / EARTH_RADIUS_KM] },
});
