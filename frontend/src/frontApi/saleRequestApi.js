import client from "./client";
import { mapSaleRequest } from "./mappers";

// "Buy Now": the backend takes the price and owner from the property
export const createSaleRequest = async ({ propertyId, fullName, email, phone, message }) =>
  mapSaleRequest((await client.post("/sale-requests", { propertyId, fullName, email, phone, message })).data);

export const getMySaleRequests = async () => (await client.get("/sale-requests/my")).data.map(mapSaleRequest);
export const getSaleRequestById = async (id) => mapSaleRequest((await client.get(`/sale-requests/${id}`)).data);
export const getAgentSaleRequests = async () => (await client.get("/agents/sale-requests")).data.map(mapSaleRequest);
export const getAdminSaleRequests = async () => (await client.get("/admin/sale-requests")).data.map(mapSaleRequest);

// Owner side: status is an API key such as "contacted" or "payment_pending"
export const updateSaleStatus = async (id, status, note = "") => mapSaleRequest((await client.patch(`/sale-requests/${id}/status`, { status, note })).data);
export const confirmOfficePayment = async (id, amount, note = "") => mapSaleRequest((await client.patch(`/sale-requests/${id}/confirm-payment`, { amount, note })).data);
export const completeSale = async (id) => mapSaleRequest((await client.patch(`/sale-requests/${id}/complete`)).data);

// Customer: withdraw their own request
export const cancelSaleRequest = async (id) => mapSaleRequest((await client.patch(`/sale-requests/${id}/cancel`)).data);
