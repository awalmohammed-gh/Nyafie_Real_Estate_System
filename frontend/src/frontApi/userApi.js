import client from "./client";

export const getSavedProperties = async () => (await client.get("/users/saved")).data;
export const toggleSavedProperty = async (propertyId) => (await client.post(`/users/saved/${propertyId}`)).data;
