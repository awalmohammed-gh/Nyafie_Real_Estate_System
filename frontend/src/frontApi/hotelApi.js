import client from "./client";

export const getRooms = async (hotelId, dates = {}) => (await client.get(`/properties/${hotelId}/rooms`, { params: dates })).data;
export const quoteRoom = async (hotelId, selection) => (await client.post(`/properties/${hotelId}/rooms/quote`, selection)).data;

// Where the hotel's online payments go (account owner only). Responses never include the full account number.
export const getPayoutBanks = async (type) => (await client.get("/properties/payout-banks", { params: { type } })).data;
export const getPayout = async (hotelId) => (await client.get(`/properties/${hotelId}/payout`)).data;
// { type: "bank" | "mobile_money", bankCode, accountNumber, password }
export const connectPayout = async (hotelId, details) => (await client.put(`/properties/${hotelId}/payout`, details)).data;
export const disconnectPayout = async (hotelId) => (await client.delete(`/properties/${hotelId}/payout`)).data;
