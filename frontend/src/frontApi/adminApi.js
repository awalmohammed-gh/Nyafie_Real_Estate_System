import client from "./client";
import { fetchPage as pageOf } from "./page";
import { inquiryStatusToApi, mapAdminInquiry, mapAdminProperty, mapCustomer, mapDispute, mapInquiry, mapLedgerRow, mapProperty, mapProvider, mapUser, toApiProperty } from "./mappers";

export const getAdminDashboard = async () => (await client.get("/admin/dashboard")).data;
export const getFinancialInventory = async (params = {}) => (await client.get("/admin/inventory", { params })).data;
// Platform performance chart: monthly totals for the last 3, 6 or 12 months and the period before
export const getPerformance = async (months) => (await client.get("/admin/performance", { params: { months } })).data;
// Sidebar badge counters
export const getAdminCounts = async () => (await client.get("/admin/counts")).data;

// Lists the server cuts into pages
export const getProvidersPage = (params) => pageOf("/admin/providers", params, mapProvider);
export const getProvider = async (id) => mapProvider((await client.get(`/admin/providers/${id}`)).data);
export const getInquiriesPage = ({ status, ...params }) => pageOf("/admin/inquiries", { ...params, status: inquiryStatusToApi(status) }, mapAdminInquiry);
// Subscribers of each plan and subscription revenue by month
export const getPlanSummary = async () => (await client.get("/admin/plan-summary")).data;
export const getCustomersPage = (params) => pageOf("/admin/customers", params, mapCustomer);
export const getCustomer = async (id) => mapCustomer((await client.get(`/admin/customers/${id}`)).data);
export const getPropertiesPage = async (params) => {
  const data = await pageOf("/admin/properties", params, mapAdminProperty);
  return { ...data, stale: data.stale.map(mapAdminProperty) };
};
export const getAdminProperty = async (id) => mapAdminProperty((await client.get(`/admin/properties/${id}`)).data);
export const getPaymentsPage = async (params) => {
  const data = await pageOf("/admin/payments", params, mapLedgerRow);
  return { ...data, openDisputes: { total: data.openDisputes.total, items: data.openDisputes.items.map((d) => ({ ...mapDispute(d), reference: d.reference, paymentAmount: d.amount })) } };
};

export const getAgentApplications = async () => (await client.get("/admin/agent-applications")).data.map(mapUser);
export const reviewAgentApplication = async (id, action, rejectionReason = "", reviewSubmittedAt) => mapUser((await client.patch(`/admin/agent-applications/${id}`, { action, rejectionReason, ...(action === "approve" ? { proofReviewed: true, reviewSubmittedAt } : {}) })).data);
export const updateUser = async (id, changes) => mapUser((await client.put(`/admin/users/${id}`, changes)).data);
export const setUserStatus = (id, status) => client.patch(`/admin/users/${id}/status`, { status });
export const deleteUser = (id) => client.delete(`/admin/users/${id}`);
export const signOutUser = (id) => client.post(`/admin/users/${id}/sign-out`); // every device

// Provider removal: remove (deactivate, keep history) -> restore, or later a separate permanent delete
export const getRemovalImpact = async (id) => (await client.get(`/admin/agents/${id}/removal`)).data;
export const removeAgent = (id, reason, note) => client.post(`/admin/agents/${id}/remove`, { reason, note });
export const restoreAgent = (id, republish) => client.post(`/admin/agents/${id}/restore`, { republish });
export const getDeletionPlan = async (id) => (await client.get(`/admin/agents/${id}/deletion`)).data;
export const deleteAgentPermanently = (id, confirm) => client.delete(`/admin/agents/${id}`, { data: { confirm } });

// action: "changePlan" | "extend" | "cancel" | "activate"
export const manageSubscription = (userId, action, extra = {}) => client.patch(`/admin/agents/${userId}/subscription`, { action, ...extra });

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
export const confirmPropertyAvailability = async (id) => mapProperty((await client.patch(`/admin/properties/${id}/confirm-availability`)).data);
export const unfeatureProperty = (id) => setPropertyFeatured(id, false);
export const deleteProperty = (id) => client.delete(`/admin/properties/${id}`);

export const updateInquiryStatus = async (id, status) =>
  mapInquiry((await client.patch(`/admin/inquiries/${id}/status`, { status: inquiryStatusToApi(status) })).data);

export const updateSettings = async (section, values) => (await client.put(`/admin/settings/${section}`, values)).data;

// Which Paystack keys are configured in backend/.env (never the keys themselves)
export const getPaymentStatus = async () => (await client.get("/admin/settings/payment-status")).data;
// The signed-in admin's own name, phone and sign-in email (email changes need the current password)
export const updateAccount = async (details) => mapUser((await client.put("/admin/account", details)).data);

// Only the fields the reports count, in one request: a download never exports half-loaded figures
export const getReportSnapshot = async () => (await client.get("/admin/report-data")).data;
