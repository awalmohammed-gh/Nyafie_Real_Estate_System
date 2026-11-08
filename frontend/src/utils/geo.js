// Location helpers for nearby discovery. Pure functions: no browser APIs, so they are unit-tested.

export const SEARCH_RADII_KM = [1, 2, 5, 10, 20, 50];
export const DEFAULT_RADIUS_KM = 5;
export const DEVICE = "me"; // ?near=me: the visitor's own (approximate) position, never written into the URL

// "500 m away", "1.2 km away", "12 km away"
export const formatDistance = (metres) => {
  if (!Number.isFinite(metres) || metres < 0) return "";
  if (metres < 50) return "Under 50 m away";
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m away`;
  const km = metres / 1000;
  return `${km < 10 ? (Math.round(km * 10) / 10).toFixed(1).replace(/\.0$/, "") : Math.round(km)} km away`;
};

/**
 * The visitor's device position is rounded to 3 decimals (about 110 m) as soon as it is read.
 * Only this approximate point is ever kept (in this tab), sent to the API or drawn on the map.
 */
export const approximate = (value) => Math.round(value * 1000) / 1000;
export const approximatePosition = ({ latitude, longitude }) => ({ latitude: approximate(latitude), longitude: approximate(longitude) });

export const isCoordinate = (latitude, longitude) =>
  Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

// A listing (UI shape) with a map pin can appear in nearby search
export const hasMapPin = (property) => isCoordinate(property?.location?.latitude, property?.location?.longitude);

export const parseRadius = (raw) => {
  const value = Number(raw);
  return SEARCH_RADII_KM.includes(value) ? value : DEFAULT_RADIUS_KM;
};

// The next wider radius for "Expand the search", or null at the widest
export const widerRadius = (radius) => SEARCH_RADII_KM.find((value) => value > radius) ?? null;

/**
 * Reads the search location from the URL.
 *   ?near=me                      -> the device position (from the visitor store), or pending
 *   ?near=5.6355,-0.1617&place=…  -> a place the visitor searched for (public coordinates)
 * Returns null when no location is selected.
 */
export const parseNear = (params, devicePosition) => {
  const raw = (params.get("near") || "").trim();
  if (!raw) return null;
  const radius = parseRadius(params.get("radius"));
  if (raw === DEVICE) {
    return devicePosition
      ? { source: "device", ...approximatePosition(devicePosition), label: "your location", radius }
      : { source: "device", pending: true, label: "your location", radius };
  }
  const [latitude, longitude] = raw.split(",").map(Number);
  if (!isCoordinate(latitude, longitude)) return null;
  return { source: "place", latitude, longitude, label: (params.get("place") || "").trim().slice(0, 120) || "the selected place", radius };
};

// URL values for a chosen location (rounded so links stay short)
export const nearToParams = (near) => near.source === "device"
  ? { near: DEVICE, place: "" }
  : { near: `${Math.round(near.latitude * 1e5) / 1e5},${Math.round(near.longitude * 1e5) / 1e5}`, place: near.label || "" };

// "within 5 km of East Legon, Accra" / "within 5 km of your location"
export const describeSearchArea = (near) => near ? `within ${near.radius} km of ${near.label}` : "";

// Short price for map markers: "₵950", "₵3.2k", "₵650k", "₵1.2M" (+ "/mo" or "/night" for rentals)
export const compactPrice = (price, { currency = "GHS", period = "total" } = {}) => {
  if (!Number.isFinite(price)) return "";
  const prefix = currency === "GHS" ? "₵" : `${currency} `;
  const short = (value, unit) => `${(Math.round(value * 10) / 10).toString().replace(/\.0$/, "")}${unit}`;
  const amount = price >= 1e6 ? short(price / 1e6, "M") : price >= 1e4 ? `${Math.round(price / 1e3)}k` : price >= 1e3 ? short(price / 1e3, "k") : String(Math.round(price));
  return `${prefix}${amount}${period === "month" ? "/mo" : period === "night" ? "/night" : ""}`;
};

// Map zoom that shows the whole search circle on a typical screen
export const zoomForRadius = (radius) => ({ 1: 15, 2: 14, 5: 13, 10: 12, 20: 11, 50: 10 })[radius] ?? 13;
