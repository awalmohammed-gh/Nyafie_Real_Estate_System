import { formatGhs } from "./property.js";
// Saved searches: the listings page's filters <-> what the server stores <-> a link back to the results

// From usePropertyBrowseState (filters, search) and parseNear (near) to the saved form
export const toSavedFilters = ({ filters, search = "", near = null }) => ({
  listingType: filters.listingType || "",
  types: filters.types || [],
  area: filters.area || "",
  city: filters.city || "",
  region: filters.region || "",
  minPrice: filters.price?.min ?? null,
  maxPrice: filters.price?.max ?? null,
  bedrooms: filters.beds || 0,
  bathrooms: filters.baths || 0,
  availability: filters.availability || "",
  amenities: filters.amenities || [],
  search: (search || "").trim(),
  near: near && !near.pending ? { latitude: near.latitude, longitude: near.longitude, radius: near.radius, label: near.source === "device" ? "your location" : near.label || "" } : null,
});

// Whether there is anything to save (the server asks for at least one filter too)
export const hasSearchCriteria = (saved) => Boolean(
  saved.listingType || saved.types.length || saved.area || saved.city || saved.region || saved.minPrice !== null || saved.maxPrice !== null ||
  saved.bedrooms || saved.bathrooms || saved.amenities.length || saved.search || saved.near,
);

// The listings URL that shows this search's results
export const savedSearchPath = (saved, listingsPath) => {
  const params = new URLSearchParams();
  const set = (key, value) => value !== null && value !== undefined && value !== "" && value !== 0 && params.set(key, String(value));
  set("status", saved.listingType);
  set("type", (saved.types || []).join(","));
  set("area", saved.area);
  set("city", saved.city);
  set("region", saved.region);
  set("minPrice", saved.minPrice);
  set("maxPrice", saved.maxPrice);
  set("bedrooms", saved.bedrooms);
  set("bathrooms", saved.bathrooms);
  set("availability", saved.availability);
  set("amenities", (saved.amenities || []).join(","));
  set("search", saved.search);
  if (saved.near) {
    params.set("near", `${saved.near.latitude},${saved.near.longitude}`);
    set("place", saved.near.label);
    params.set("radius", String(saved.near.radius));
  }
  const query = params.toString();
  return query ? `${listingsPath}?${query}` : listingsPath;
};

// Short labels for the search's filters: ["To rent", "2+ beds", "East Legon", "Up to ₵3,000"]
export const describeFilters = (saved) => [
  saved.listingType === "Sale" ? "For sale" : saved.listingType === "Rent" ? "To rent" : "",
  ...(saved.types || []),
  saved.bedrooms ? `${saved.bedrooms}+ beds` : "",
  saved.bathrooms ? `${saved.bathrooms}+ baths` : "",
  saved.area, saved.city, saved.region,
  saved.near ? `Within ${saved.near.radius} km of ${saved.near.label || "a place"}` : "",
  saved.minPrice !== null && saved.maxPrice !== null ? `${formatGhs(saved.minPrice)} – ${formatGhs(saved.maxPrice)}` : saved.maxPrice !== null ? `Up to ${formatGhs(saved.maxPrice)}` : saved.minPrice !== null ? `From ${formatGhs(saved.minPrice)}` : "",
  saved.availability,
  ...(saved.amenities || []),
  saved.search ? `“${saved.search}”` : "",
].filter(Boolean);
