import client from "./client";
import { mapRental } from "./mappers";

// Saves the rental request. Dates are "YYYY-MM-DD"; the backend checks availability and calculates the amount.
export const createRental = async ({ propertyId, startDate, endDate, fullName, email, phone, currentAddress, occupants, notes }) =>
  mapRental((await client.post("/rentals", { propertyId, startDate, endDate, fullName, email, phone, currentAddress, occupants, notes })).data);

export const getMyRentals = async () => (await client.get("/rentals/my")).data.map(mapRental);
export const getRentalById = async (id) => mapRental((await client.get(`/rentals/${id}`)).data);
export const getAgentRentals = async () => (await client.get("/agents/rentals")).data.map(mapRental);
export const getAdminRentals = async () => (await client.get("/admin/rentals")).data.map(mapRental);

// Owner side: status is an API key such as "confirmed", "active", "completed" or "cancelled"
export const updateRentalStatus = async (id, status, note = "") => mapRental((await client.patch(`/rentals/${id}/status`, { status, note })).data);
