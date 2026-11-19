import client from "./client";
import { mapViewing } from "./mappers";

// The backend takes the owner from the property; the customer sends the listing, a Ghana-time slot and contact details
export const requestViewing = async ({ propertyId, date, time, phone, message }) =>
  mapViewing((await client.post("/viewings", { propertyId, date, time, phone, message })).data);

export const getMyViewings = async () => (await client.get("/viewings/my")).data.map(mapViewing);
export const getAgentViewings = async () => (await client.get("/agents/viewings")).data.map(mapViewing);
export const getAdminViewings = async () => (await client.get("/admin/viewings")).data.map(mapViewing);

/**
 * action: owner side confirm | propose | decline | cancel | complete | missed;
 * customer side accept | propose | cancel. propose needs { date, time }.
 */
export const updateViewing = async (id, action, { date, time, message } = {}) =>
  mapViewing((await client.patch(`/viewings/${id}`, { action, date, time, message })).data);
