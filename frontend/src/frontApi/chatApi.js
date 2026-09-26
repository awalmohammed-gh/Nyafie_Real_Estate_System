import client from "./client";
import { mapConversation, mapMessage } from "./mappers";

// Inbox endpoints by audience: conversations the user started, or chats about
// the listings they own (agents) / HomeBase listings (admins)
const INBOX = { customer: "/messages", agent: "/agents/messages", admin: "/admin/messages" };

export const getConversations = async (scope = "customer") => (await client.get(INBOX[scope])).data.map(mapConversation);

export const getConversationById = async (id) => {
  const data = (await client.get(`/conversations/${id}`)).data;
  return { conversation: mapConversation(data.conversation), messages: data.messages.map(mapMessage) };
};

// Opens (or continues) a chat with the owner of a property
export const createConversation = async (propertyId, message) => mapConversation((await client.post("/conversations", { propertyId, message })).data);

export const sendMessage = async (conversationId, message) => mapMessage((await client.post(`/conversations/${conversationId}/messages`, { message })).data);
export const markConversationAsRead = (conversationId) => client.put(`/conversations/${conversationId}/read`);
export const closeConversation = async (conversationId) => mapConversation((await client.put(`/conversations/${conversationId}/close`)).data);
