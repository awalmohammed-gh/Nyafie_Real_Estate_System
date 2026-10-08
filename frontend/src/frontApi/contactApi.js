import client from "./client";

export const sendMessage = async (fields) => (await client.post("/contact", fields)).data;
export const getMessages = async (params) => (await client.get("/admin/contact-messages", { params })).data;
export const setMessageStatus = async (id, status) => (await client.patch(`/admin/contact-messages/${id}/status`, { status })).data;
