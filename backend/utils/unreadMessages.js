import Conversation from "../models/Conversation.js";
import { teamFilter } from "./team.js";

/**
 * Unread messages in the open conversations of the signed-in area: the customer's own chats, the chats
 * about an agent's listings (staff: as their role allows) or about NyaFie listings. The same
 * conversations each inbox lists (chatController listConversations), counted without loading them.
 */
export const unreadMessages = async (user, sessionDomain) => {
  let filter;
  if (sessionDomain === "customer") filter = { customer: user._id };
  else if (user.role === "admin") filter = { ownerType: "admin" };
  else if (user.role === "agent") filter = { ownerType: "agent", ...teamFilter(user) };
  else return 0;
  const field = sessionDomain === "customer" ? "customerUnread" : "ownerUnread";
  const rows = await Conversation.find({ ...filter, status: "open", [field]: { $gt: 0 } }).select(field).lean();
  return rows.reduce((sum, row) => sum + row[field], 0);
};
