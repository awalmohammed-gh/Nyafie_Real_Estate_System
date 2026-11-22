// Location pages: /rent/east-legon, /sale/accra (a neighbourhood or a city with listings). Their
// address must match the server's, which names them in the sitemap and in search results
// (backend/utils/seo.js placeSlug); a backend test checks both give the same result.
// Ghanaian letters keep their sound (Ɔdɔ -> odo, Ɛkumfi -> ekumfi); other accents are dropped
export const placeSlug = (name = "") => String(name).toLowerCase().replace(/ɔ/g, "o").replace(/ɛ/g, "e").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const placePath = (listingType, name) => `/${listingType === "Sale" ? "sale" : "rent"}/${placeSlug(name)}`;

// Search-style wording, the same as the server's page titles (backend/utils/seo.js), used when the
// app sets a title itself (moving between pages without reloading)
const typeName = (type = "") => String(type).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const NO_BEDROOMS = /^(land|plot|office|shop|store|warehouse|commercial|hotel)/i;
/** "3-Bedroom House for Rent", "Land for Sale", "Hotel" */
export const propertyHeadline = ({ propertyType = "", listingType, bedrooms = 0 }) => {
  const type = typeName(propertyType) || "Property";
  if (/^hotel/i.test(propertyType)) return type;
  const beds = bedrooms > 0 && !NO_BEDROOMS.test(propertyType) ? `${bedrooms}-Bedroom ` : "";
  return `${beds}${type} ${listingType === "Sale" ? "for Sale" : "for Rent"}`;
};
/** "East Legon, Accra", or "Ghana" */
export const placeLabel = ({ neighbourhood, city } = {}) => [...new Set([neighbourhood, city].map((value) => value?.trim()).filter(Boolean))].join(", ") || "Ghana";

/**
 * The place a location page is about, from the listing facets (usePropertyFacets): its neighbourhoods
 * first (as the server does), then its cities. { area?, city, label } or null when there is none.
 */
export const findPlace = (facets, slug) => {
  const key = String(slug || "").toLowerCase();
  const area = (facets?.areas || []).find((entry) => placeSlug(entry.name) === key);
  if (area) return { area: area.name, city: area.city || "", label: [...new Set([area.name, area.city].filter(Boolean))].join(", ") };
  const city = (facets?.cities || []).find((entry) => placeSlug(entry.name) === key);
  return city ? { city: city.name, label: city.name } : null;
};
