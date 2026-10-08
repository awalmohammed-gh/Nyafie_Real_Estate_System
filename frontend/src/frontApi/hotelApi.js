import client from "./client";

export const getRooms = async (hotelId, dates = {}) => (await client.get(`/properties/${hotelId}/rooms`, { params: dates })).data;
export const quoteRoom = async (hotelId, selection) => (await client.post(`/properties/${hotelId}/rooms/quote`, selection)).data;
