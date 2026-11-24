import client from "./client";
import { fetchPage, ownerPath } from "./page";
import { mapSaleRequest } from "./mappers";

// "Buy Now": the backend takes the price and owner from the property
export const createSaleRequest = async ({ propertyId, fullName, email, phone, message }) =>
  mapSaleRequest((await client.post("/sale-requests", { propertyId, fullName, email, phone, message })).data);

export const getMySaleRequests = async () => (await client.get("/sale-requests/my")).data.map(mapSaleRequest);
export const getSaleRequestById = async (id) => mapSaleRequest((await client.get(`/sale-requests/${id}`)).data);
export const getSaleRequestsPage = (scope, params) => fetchPage(ownerPath(scope, "sale-requests"), params, mapSaleRequest);

// Owner side: status is an API key such as "contacted" or "payment_pending"
export const updateSaleStatus = async (id, status, note = "") => mapSaleRequest((await client.patch(`/sale-requests/${id}/status`, { status, note })).data);
// Owner side: the buyer paid at the office. Their receipt is issued and sent with it.
export const confirmOfficePayment = async (id, amount, note = "", reference = "") => mapSaleRequest((await client.patch(`/sale-requests/${id}/confirm-payment`, { amount, note, reference })).data);
export const completeSale = async (id) => mapSaleRequest((await client.patch(`/sale-requests/${id}/complete`)).data);

// Customer: withdraw their own request
export const cancelSaleRequest = async (id) => mapSaleRequest((await client.patch(`/sale-requests/${id}/cancel`)).data);
