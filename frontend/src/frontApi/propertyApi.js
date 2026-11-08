import client from "./client";
import { mapProperty, toApiProperty } from "./mappers";

export const getProperties = async () => (await client.get("/properties")).data.map(mapProperty);
export const getPropertyById = async (id) => mapProperty((await client.get(`/properties/${id}`)).data);
export const getMyProperties = async () => (await client.get("/properties/my")).data.map(mapProperty);

export const createProperty = async (property) => {
  const res = await client.post("/properties", toApiProperty(property));
  return { property: mapProperty(res.data), message: res.message };
};

export const updateProperty = async (id, changes) => {
  const res = await client.put(`/properties/${id}`, toApiProperty(changes));
  return { property: mapProperty(res.data), message: res.message };
};

export const featureProperty = async (id, isFeatured) => mapProperty((await client.patch(`/properties/${id}/feature`, { isFeatured })).data);
export const deleteProperty = (id) => client.delete(`/properties/${id}`);
// Agency owner or manager: memberId of a team member, or null to hand the listing back to the owner
export const assignProperty = async (id, memberId) => mapProperty((await client.patch(`/properties/${id}/assign`, { memberId })).data);
// Details page only. The server decides whether this visit counts -> { counted, views }
export const recordPropertyView = async (id) => (await client.post(`/properties/${id}/view`)).data;

// Drops empty filters so the query string only carries what the user chose
const cleanParams = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v]));

/**
 * Server-side search with pagination. params: page, limit, search, listingType, type (array),
 * area, city, availability, minPrice, maxPrice, bedrooms, bathrooms, featured, owner, ids, exclude, sort.
 * Returns { items, total, page, pages, limit }.
 */
export const searchProperties = async (params = {}, { signal } = {}) => {
  const data = (await client.get("/properties", { params: cleanParams({ page: 1, ...params }), signal })).data;
  return { ...data, items: data.items.map(mapProperty) };
};

/**
 * Listings around a point, nearest first, filtered on the server.
 * params: latitude, longitude, radius (km: 1, 2, 5, 10, 20, 50) plus the searchProperties filters
 * (listingType, type, minPrice, maxPrice, bedrooms, bathrooms, amenities, search, sort, page, limit).
 * Each item has `distance` in metres. Returns { items, total, page, pages, limit, radius }.
 */
export const nearbyProperties = async (params, { signal } = {}) => {
  const data = (await client.get("/properties/nearby", { params: cleanParams({ page: 1, ...params }), signal })).data;
  return { ...data, items: data.items.map(mapProperty) };
};

/**
 * The same search for the map: up to 200 compact markers
 * ({ id, title, price, listingType, propertyType, bedrooms, location, image, distance, ... }).
 */
export const nearbyMarkers = async (params, { signal } = {}) =>
  (await client.get("/properties/nearby", { params: cleanParams({ ...params, page: undefined, limit: 200, format: "markers" }), signal })).data;

// Load only referenced listings, with bounded batches even for a long inquiry history.
export const getPropertiesByIds = async (ids) => {
  const unique = [...new Set(ids.filter(Boolean))];
  const items = [];
  for (let start = 0; start < unique.length; start += 48) {
    items.push(...(await searchProperties({ ids: unique.slice(start, start + 48), limit: 48 })).items);
  }
  return items;
};

// Filter options and headline numbers computed in MongoDB (types, areas with counts, totals)
export const getPropertyFacets = async (params = {}) => (await client.get("/properties/facets", { params: cleanParams(params) })).data;

// Similar published listings for a property's details page
export const getRelatedProperties = async (id, limit = 3) => (await client.get(`/properties/${id}/related`, { params: { limit } })).data.map(mapProperty);
