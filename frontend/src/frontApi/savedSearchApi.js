import client from "./client";

// A customer's saved searches and their new-listing alerts (filters: utils/savedSearch.js)
export const getSavedSearches = async () => (await client.get("/saved-searches")).data;
export const saveSearch = async (filters, name) => (await client.post("/saved-searches", { filters, ...(name ? { name } : {}) })).data;
export const updateSavedSearch = async (id, changes) => (await client.patch(`/saved-searches/${id}`, changes)).data;
export const deleteSavedSearch = async (id) => (await client.delete(`/saved-searches/${id}`)).data;
