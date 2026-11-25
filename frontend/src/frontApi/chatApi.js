import client from "./client";
import { fetchPage } from "./page";
import { mapConversation, mapMessage } from "./mappers";

// Inbox endpoints by audience: conversations the user started, or chats about
// the listings they own (agents) / NyaFie listings (admins)
const INBOX = {
  customer: "/messages",
  agent: "/agents/messages",
  admin: "/admin/messages",
};

export const getConversationsPage = (scope, params) => fetchPage(INBOX[scope], params, mapConversation);

// The latest messages, or the ones before `before` (a message id)
export const getConversationById = async (id, { before } = {}) => {
  const data = (await client.get(`/conversations/${id}`, { params: { before } })).data;
  const offer = data.offer
    ? {
        amount: data.offer.amount,
        askingPrice: data.offer.askingPrice,
        counterAmount: data.offer.counterAmount,
        status: data.offer.status,
      }
    : null;
  return {
    conversation: mapConversation(data.conversation),
    messages: data.messages.map(mapMessage),
    hasEarlier: Boolean(data.hasEarlier),
    offer,
  };
};

// Opens (or continues) a chat with the owner of a property
export const createConversation = async (propertyId, message) =>
  mapConversation(
    (await client.post("/conversations", { propertyId, message })).data,
  );

export const sendMessage = async (conversationId, message) =>
  mapMessage(
    (
      await client.post(`/conversations/${conversationId}/messages`, {
        message,
      })
    ).data,
  );
export const markConversationAsRead = (conversationId) =>
  client.put(`/conversations/${conversationId}/read`);
export const closeConversation = async (conversationId) =>
  mapConversation(
    (await client.put(`/conversations/${conversationId}/close`)).data,
  );

// Short names used by the offer and rental screens
export const getConversation = getConversationById;
export const markAsRead = markConversationAsRead;
