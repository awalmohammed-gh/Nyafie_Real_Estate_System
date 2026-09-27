import client from "./client";
import { inquiryStatusToApi, mapInquiry, mapPayment, mapProperty, mapUser, toApiProperty } from "./mappers";

export const getAdminDashboard = async () => (await client.get("/admin/dashboard")).data;

export const getUsers = async () => (await client.get("/admin/users")).data.map(mapUser);
export const getAgents = async () => (await client.get("/admin/agents")).data.map(mapUser);
export const updateUser = async (id, changes) => mapUser((await client.put(`/admin/users/${id}`, changes)).data);
export const setUserStatus = (id, status) => client.patch(`/admin/users/${id}/status`, { status });
export const deleteUser = (id) => client.delete(`/admin/users/${id}`);

// action: "changePlan" | "extend" | "cancel" | "activate"
export const manageSubscription = (userId, action, extra = {}) => client.patch(`/admin/agents/${userId}/subscription`, { action, ...extra });
export const getSubscriptions = async () => (await client.get("/admin/subscriptions")).data.map(mapPayment);

export const getAllProperties = async () => (await client.get("/admin/properties")).data.map(mapProperty);

// Admin-owned listings: the backend sets the signed-in admin as owner (ownerType "admin")
export const createAdminProperty = async (property) => {
  const res = await client.post("/admin/properties", toApiProperty(property));
  return { property: mapProperty(res.data), message: res.message };
};
export const updateAdminProperty = async (id, changes) => {
  const res = await client.put(`/admin/properties/${id}`, toApiProperty(changes));
  return { property: mapProperty(res.data), message: res.message };
};
export const deleteAdminProperty = (id) => client.delete(`/admin/properties/${id}`);
export const publishAdminProperty = (id) => updateAdminProperty(id, { listing: { state: "published" } });
export const unpublishAdminProperty = (id) => updateAdminProperty(id, { listing: { state: "draft" } });
export const updateProperty = async (id, changes) => mapProperty((await client.put(`/admin/properties/${id}`, toApiProperty(changes))).data);
export const setPropertyStatus = async (id, status, rejectionReason) =>
  mapProperty((await client.patch(`/admin/properties/${id}/status`, { status, rejectionReason })).data);
export const setPropertyFeatured = async (id, isFeatured) => mapProperty((await client.patch(`/admin/properties/${id}/feature`, { isFeatured })).data);
export const featureProperty = (id) => setPropertyFeatured(id, true);
export const unfeatureProperty = (id) => setPropertyFeatured(id, false);
export const deleteProperty = (id) => client.delete(`/admin/properties/${id}`);

export const getAllInquiries = async () => (await client.get("/admin/inquiries")).data.map(mapInquiry);
export const updateInquiryStatus = async (id, status) =>
  mapInquiry((await client.patch(`/admin/inquiries/${id}/status`, { status: inquiryStatusToApi(status) })).data);

export const updateSettings = async (section, values) => (await client.put(`/admin/settings/${section}`, values)).data;

// Which Paystack keys are configured in backend/.env (never the keys themselves)
export const getPaymentStatus = async () => (await client.get("/admin/settings/payment-status")).data;
// The signed-in admin's own name, phone and sign-in email (email changes need the current password)
export const updateAccount = async (details) => mapUser((await client.put("/admin/account", details)).data);
