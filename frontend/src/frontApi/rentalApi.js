import client from "./client";
import { mapRental } from "./mappers";

// Saves the rental request. Dates are "YYYY-MM-DD"; the backend checks availability and calculates the amount.
// Stays (hotels, per-night rentals) also send arrivalTime: when the guest will arrive on the check-in day ("15:30").
export const createRental = async ({ propertyId, startDate, endDate, fullName, email, phone, currentAddress, occupants, notes, roomTypeId, checkIn, checkOut, guests, numberOfRooms, arrivalTime }) =>
  mapRental((await client.post("/rentals", { propertyId, startDate, endDate, fullName, email, phone, currentAddress, occupants, notes, roomTypeId, checkIn, checkOut, guests, numberOfRooms, arrivalTime })).data);

export const getMyRentals = async () => (await client.get("/rentals/my")).data.map(mapRental);
export const getRentalById = async (id) => mapRental((await client.get(`/rentals/${id}`)).data);
export const getAgentRentals = async () => (await client.get("/agents/rentals")).data.map(mapRental);
export const getAdminRentals = async () => (await client.get("/admin/rentals")).data.map(mapRental);

// Owner side: status is an API key such as "confirmed", "active", "completed" or "cancelled"
export const updateRentalStatus = async (id, status, note = "") => mapRental((await client.patch(`/rentals/${id}/status`, { status, note })).data);

// Stays (hotels and per-night rentals): "reserve now, pay on arrival" (rooms or dates are secured first), and cancelling it before check-in day
export const reserveOnArrival = async (id, arrivalTime) => mapRental((await client.post(`/rentals/${id}/reserve`, arrivalTime ? { arrivalTime } : {})).data);
// Stays: the guest changes when they'll arrive (the hotel or owner is told)
export const updateArrivalTime = async (id, arrivalTime) => mapRental((await client.patch(`/rentals/${id}/arrival`, { arrivalTime })).data);
export const cancelReservation = async (id) => mapRental((await client.patch(`/rentals/${id}/cancel`, {})).data);
// Owner side: the guest paid on arrival, or the tenant paid at the office (the receipt is sent with it)
export const recordArrivalPayment = async (id, note = "") => mapRental((await client.patch(`/rentals/${id}/paid-on-arrival`, { note })).data);
export const recordOfficePayment = async (id, { note = "", reference = "" } = {}) => mapRental((await client.patch(`/rentals/${id}/paid-at-office`, { note, reference })).data);
// Owner side: the receipt for a hotel booking the guest paid online into the hotel's account
export const sendReceipt = async (id, note = "") => mapRental((await client.post(`/rentals/${id}/receipt`, { note })).data);
