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
