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
export const recordPropertyView = (id) => client.post(`/properties/${id}/view`);

// Drops empty filters so the query string only carries what the user chose
const cleanParams = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v]));

/**
 * Server-side search with pagination. params: page, limit, search, listingType, type (array),
 * area, city, availability, minPrice, maxPrice, bedrooms, bathrooms, featured, owner, ids, exclude, sort.
 * Returns { items, total, page, pages, limit }.
 */
export const searchProperties = async (params = {}) => {
  const data = (await client.get("/properties", { params: cleanParams({ page: 1, ...params }) })).data;
  return { ...data, items: data.items.map(mapProperty) };
};

// Filter options and headline numbers computed in MongoDB (types, areas with counts, totals)
export const getPropertyFacets = async (params = {}) => (await client.get("/properties/facets", { params: cleanParams(params) })).data;

// Similar published listings for a property's details page
export const getRelatedProperties = async (id, limit = 3) => (await client.get(`/properties/${id}/related`, { params: { limit } })).data.map(mapProperty);
