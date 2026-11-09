import Property from "../models/Property.js";
import SavedSearch from "../models/SavedSearch.js";
import User from "../models/User.js";
import { buildPublicFilter } from "../controllers/propertyController.js";
import { isPubliclyVisible } from "./marketplace.js";
import { notifyUser } from "./notify.js";
import { HttpError } from "./response.js";
import { SEARCH_RADII_KM } from "./geo.js";
import { absoluteUrl } from "./seo.js";
import { searchAlertMailer } from "./email.js";
import { reportError } from "./monitoring.js";

export const MAX_SAVED_SEARCHES = 20;
const EMAIL_GAP = 60 * 60 * 1000; // at most one alert email per saved search per hour
const OPEN = ["Available", "Under Offer"];

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const words = (value, max, count) => [...new Set((Array.isArray(value) ? value : []).map((item) => text(item, max)).filter(Boolean))].slice(0, count);
const money = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1e10) throw new HttpError(400, "Enter a valid price.");
  return Math.round(number);
};
const count = (value) => {
  const number = Math.floor(Number(value) || 0);
  if (number < 0 || number > 50) throw new HttpError(400, "Enter a valid number of rooms.");
  return number;
};

/**
 * Checks and normalises a search from the listings page:
 * { listingType, types, area, city, region, minPrice, maxPrice, bedrooms, bathrooms,
 *   availability, amenities, search, near: { latitude, longitude, radius, label } | null }
 */
export const parseSavedFilters = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Invalid search.");
  const filters = {
    listingType: ["Sale", "Rent"].includes(input.listingType) ? input.listingType : "",
    types: words(input.types, 60, 10),
    area: text(input.area, 80),
    city: text(input.city, 80),
    region: text(input.region, 80),
    minPrice: money(input.minPrice),
    maxPrice: money(input.maxPrice),
    bedrooms: count(input.bedrooms),
    bathrooms: count(input.bathrooms),
    availability: OPEN.includes(input.availability) ? input.availability : "",
    amenities: words(input.amenities, 60, 10),
    search: text(input.search, 80),
    near: null,
  };
  if (filters.minPrice !== null && filters.maxPrice !== null && filters.minPrice > filters.maxPrice) throw new HttpError(400, "The minimum price is higher than the maximum.");
  if (input.near) {
    const latitude = Number(input.near.latitude), longitude = Number(input.near.longitude), radius = Number(input.near.radius);
    if (!(latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) || !SEARCH_RADII_KM.includes(radius)) throw new HttpError(400, "Choose a valid search location.");
    // Rounded to about 100 m: enough to match listings, without storing a precise position
    filters.near = { latitude: Math.round(latitude * 1000) / 1000, longitude: Math.round(longitude * 1000) / 1000, radius, label: text(input.near.label, 120) };
  }
  const criteria = filters.listingType || filters.types.length || filters.area || filters.city || filters.region || filters.minPrice !== null || filters.maxPrice !== null || filters.bedrooms || filters.bathrooms || filters.amenities.length || filters.search || filters.near;
  if (!criteria) throw new HttpError(400, "Choose at least one filter (for example a place, a price or a property type) before saving this search.");
  return filters;
};

// The same query the listings page sends (see propertyController.buildPublicFilter)
export const toQuery = (filters) => Object.fromEntries(Object.entries({
  listingType: filters.listingType,
  type: filters.types?.join(","),
  area: filters.area, city: filters.city, region: filters.region,
  minPrice: filters.minPrice ?? undefined, maxPrice: filters.maxPrice ?? undefined,
  bedrooms: filters.bedrooms || undefined, bathrooms: filters.bathrooms || undefined,
  availability: filters.availability || OPEN.join(","), // alerts are for homes people can still take
  amenities: filters.amenities?.join(","),
  search: filters.search,
}).filter(([, value]) => value !== undefined && value !== null && value !== ""));

const ghs = (value) => `₵${Number(value).toLocaleString("en-GH")}`;

// "2+ bed House to rent in East Legon, ₵2,000–₵3,000"
export const describeSearch = (filters) => {
  const what = [filters.bedrooms ? `${filters.bedrooms}+ bed` : "", filters.types.length ? filters.types.join(" / ") : "homes"].filter(Boolean).join(" ");
  const purpose = filters.listingType === "Sale" ? " for sale" : filters.listingType === "Rent" ? " to rent" : "";
  const place = filters.area || filters.city || filters.region || (filters.near ? `${filters.near.radius} km of ${filters.near.label || "a place"}` : "");
  const where = place ? (filters.near && !filters.area && !filters.city && !filters.region ? ` within ${place}` : ` in ${place}`) : "";
  const price = filters.minPrice !== null && filters.maxPrice !== null ? `${ghs(filters.minPrice)}–${ghs(filters.maxPrice)}` : filters.maxPrice !== null ? `up to ${ghs(filters.maxPrice)}` : filters.minPrice !== null ? `from ${ghs(filters.minPrice)}` : "";
  const keyword = filters.search ? ` "${filters.search}"` : "";
  const name = `${what}${purpose}${where}${price ? `, ${price}` : ""}${keyword}`;
  return (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 80);
};

// Great-circle distance in km
const distanceKm = (a, b) => {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude), dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const nearMatches = (near, property) => {
  if (!near) return true;
  const { latitude, longitude } = property.location || {};
  return Number.isFinite(latitude) && Number.isFinite(longitude) && distanceKm(near, { latitude, longitude }) <= near.radius;
};

const priceText = (property) => `${ghs(property.price)}${property.pricePeriod === "month" ? "/month" : property.pricePeriod === "night" ? "/night" : ""}`;

/**
 * Tells customers whose saved searches match a listing that has just been published. Called
 * after a listing becomes published (agent or admin). Each search hears about a listing once;
 * the listing's own owner is never alerted. Never throws: publishing must not fail because of it.
 */
export const alertSavedSearches = async (property) => {
  try {
    if (!property || property.status !== "published" || !OPEN.includes(property.availability)) return 0;
    if (!(await isPubliclyVisible(property))) return 0;
    const candidates = await SavedSearch.find({
      user: { $ne: property.owner },
      "filters.listingType": { $in: ["", property.listingType] },
      alertedIds: { $ne: property._id },
    }).limit(500).lean();
    let sent = 0;
    for (const search of candidates) {
      if (!nearMatches(search.filters.near, property)) continue;
      if (!(await Property.exists(buildPublicFilter(toQuery(search.filters), { _id: property._id })))) continue;
      // Claim the alert first, so two publishes at once cannot both announce it
      const claimed = await SavedSearch.updateOne(
        { _id: search._id, alertedIds: { $ne: property._id } },
        { $push: { alertedIds: { $each: [property._id], $slice: -200 } }, $set: { lastAlertAt: new Date() } },
      );
      if (!claimed.modifiedCount) continue;
      const place = [property.location?.neighbourhood, property.location?.city].filter(Boolean).join(", ");
      await notifyUser(search.user, {
        type: "search_alert",
        title: "New home matches your saved search",
        message: `${property.title} · ${priceText(property)}${place ? ` · ${place}` : ""} — “${search.name}”`,
        link: `/house/${property._id}`,
      });
      if (search.emailAlerts && !(search.lastEmailAt && Date.now() - new Date(search.lastEmailAt).getTime() < EMAIL_GAP)) {
        await emailAlert(search, property, place);
      }
      sent += 1;
    }
    return sent;
  } catch (error) {
    console.error("Saved search alerts failed:", error.message);
    await reportError(error, { tags: { job: "saved-search-alerts" } });
    return 0;
  }
};

const emailAlert = async (search, property, place) => {
  try {
    const user = await User.findById(search.user).select("email preferences isActive").lean();
    if (!user?.email || user.isActive === false || user.preferences?.searchAlerts === false) return;
    await searchAlertMailer.send(user.email, { searchName: search.name, title: property.title, price: priceText(property), place, url: absoluteUrl(`/house/${property._id}`), manageUrl: absoluteUrl("/account/searches") });
    await SavedSearch.updateOne({ _id: search._id }, { $set: { lastEmailAt: new Date() } });
  } catch (error) {
    // Email is a courtesy: the in-app alert has been delivered (no email set up, provider down...)
    if (error.status !== 503) console.error("Saved search email failed:", error.message);
  }
};

// What the account page shows (never the alert bookkeeping)
export const presentSavedSearch = (search) => ({
  id: String(search._id),
  name: search.name,
  filters: search.filters,
  emailAlerts: search.emailAlerts,
  lastAlertAt: search.lastAlertAt,
  createdAt: search.createdAt,
});
