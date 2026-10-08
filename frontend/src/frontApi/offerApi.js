import client from "./client";
import { mapOffer } from "./mappers";

// The backend takes the owner and asking price from the property; only the id, amount and message are sent
export const createOffer = async ({ propertyId, amount, message }) => mapOffer((await client.post("/offers", { propertyId, amount, message })).data);

export const getMyOffers = async () => (await client.get("/offers/my")).data.map(mapOffer);
export const getOfferById = async (id) => mapOffer((await client.get(`/offers/${id}`)).data);
export const getAgentOffers = async () => (await client.get("/agents/offers")).data.map(mapOffer);
export const getAdminOffers = async () => (await client.get("/admin/offers")).data.map(mapOffer);

// action: "accept" | "reject"
export const updateOfferStatus = async (id, action, message = "") => mapOffer((await client.patch(`/offers/${id}/respond`, { action, message })).data);
export const counterOffer = async (id, counterAmount, message = "") =>
  mapOffer((await client.patch(`/offers/${id}/respond`, { action: "counter", counterAmount, message })).data);
export const withdrawOffer = async (id) => mapOffer((await client.patch(`/offers/${id}/withdraw`)).data);
