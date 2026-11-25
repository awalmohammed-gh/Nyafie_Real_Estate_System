import client from "./client";
import { inquiryStatusToApi, mapInquiry, mapPlan, mapSubscription } from "./mappers";

export const getAgentDashboard = async () => {
  const data = (await client.get("/agents/dashboard")).data;
  return { ...data, subscription: mapSubscription(data.subscription), currentPlan: data.currentPlan && mapPlan(data.currentPlan) };
};

export const getAgentInquiries = async () => (await client.get("/agents/inquiries")).data.map(mapInquiry);
export const assignInquiry = async (id, memberId) => mapInquiry((await client.patch(`/agents/inquiries/${id}/assign`, { memberId })).data);

export const updateAgentInquiryStatus = async (id, status) =>
  mapInquiry((await client.patch(`/agents/inquiries/${id}/status`, { status: inquiryStatusToApi(status) })).data);

// Sidebar badges: what needs a response
export const getAgentCounts = async () => (await client.get("/agents/counts")).data;

// Offers and requests received per listing: { <property id>: { offers, pendingOffers, requests } }
export const getPropertyActivity = async () => (await client.get("/agents/property-activity")).data;

// Signed-in agents directory: available agents (active account + subscription), with or without listings
export const getPublicAgents = async () => (await client.get("/agents/public")).data;
