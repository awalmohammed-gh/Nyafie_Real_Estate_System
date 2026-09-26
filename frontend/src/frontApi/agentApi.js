import client from "./client";
import { inquiryStatusToApi, mapInquiry, mapPlan, mapSubscription } from "./mappers";

export const getAgentDashboard = async () => {
  const data = (await client.get("/agents/dashboard")).data;
  return { ...data, subscription: mapSubscription(data.subscription), currentPlan: data.currentPlan && mapPlan(data.currentPlan) };
};

export const getAgentInquiries = async () => (await client.get("/agents/inquiries")).data.map(mapInquiry);

export const updateAgentInquiryStatus = async (id, status) =>
  mapInquiry((await client.patch(`/agents/inquiries/${id}/status`, { status: inquiryStatusToApi(status) })).data);
