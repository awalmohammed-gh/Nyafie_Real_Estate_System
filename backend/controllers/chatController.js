import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message, { MAX_MESSAGE_LENGTH } from "../models/Message.js";
import Property from "../models/Property.js";
import { ok, fail } from "../utils/response.js";

const same = (a, b) => a && b && String(a._id || a) === String(b._id || b);

/**
 * Which side of the conversation the signed-in account is on, or null when it
 * has no access. This single check guards every chat read and write:
 *  - customers: their own conversations
 *  - agents:    conversations about their own properties
 *  - admins:    conversations about admin-owned properties (never agent ones)
 */
const sideOf = (conversation, user) => {
  if (same(conversation.customer, user)) return "customer";
  if (conversation.ownerType === "agent" && user.role === "agent" && same(conversation.owner, user)) return "owner";
  if (conversation.ownerType === "admin" && user.role === "admin") return "owner";
  return null;
};

const PROPERTY_FIELDS = "title images location price pricePeriod listingType status availability ownerType contact";

// Shapes a conversation for the viewer (customers only see public owner details)
const present = (conversation, user) => {
  const side = sideOf(conversation, user);
  const c = conversation.toJSON();
  const customer = conversation.customer;
  const owner = conversation.owner;
  return {
    ...c,
    side,
    unread: side === "customer" ? c.customerUnread : c.ownerUnread,
    customer: customer?._id
      ? {
          id: String(customer._id),
          name: `${customer.firstName} ${customer.lastName}`,
          ...(side === "owner" ? { email: customer.email, phone: customer.phone } : {}),
        }
      : { id: String(customer) },
    owner:
      conversation.ownerType === "admin"
        ? { id: "admin", name: "HomeBase", type: "admin" }
        : { id: String(owner?._id || owner), name: owner?.firstName ? `${owner.firstName} ${owner.lastName}` : "Agent", type: "agent" },
  };
};

const populate = (query) =>
  query.populate("property", PROPERTY_FIELDS).populate("customer", "firstName lastName email phone").populate("owner", "firstName lastName");

// Loads a conversation and verifies the signed-in account may access it
const loadAuthorized = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    fail(res, 404, "Conversation not found.");
    return null;
  }
  const conversation = await populate(Conversation.findById(req.params.id));
  if (!conversation || !sideOf(conversation, req.user)) {
    fail(res, 404, "Conversation not found."); // same answer as "missing" so ids can't be probed
    return null;
  }
  return conversation;
};

const validateText = (text) => {
  const value = String(text ?? "").trim();
  if (!value) return { error: "Write a message first." };
  if (value.length > MAX_MESSAGE_LENGTH) return { error: `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.` };
  return { value };
};

// Saves a message from the signed-in account and updates the conversation summary
const addMessage = async (conversation, user, side, text) => {
  const message = await Message.create({ conversation: conversation._id, sender: user._id, message: text });
  conversation.lastMessage = text.length > 140 ? `${text.slice(0, 137)}...` : text;
  conversation.lastMessageAt = message.createdAt;
  conversation.lastSender = user._id;
  if (side === "customer") conversation.ownerUnread += 1;
  else conversation.customerUnread += 1;
  await conversation.save();
  return message;
};

// GET /api/conversations?scope=customer|owner (plus the /messages aliases)
export const listConversations = (scopeOverride) => async (req, res) => {
  const scope = scopeOverride || req.query.scope || "customer";
  let filter;
  if (scope === "customer") filter = { customer: req.user._id };
  else if (req.user.role === "admin") filter = { ownerType: "admin" };
  else if (req.user.role === "agent") filter = { ownerType: "agent", owner: req.user._id };
  else return ok(res, []); // customers own no listings

  const conversations = await populate(Conversation.find(filter).sort({ lastMessageAt: -1 }));
  ok(res, conversations.map((c) => present(c, req.user)));
};

// GET /api/conversations/:id -> conversation + messages
export const getConversation = async (req, res) => {
  const conversation = await loadAuthorized(req, res);
  if (!conversation) return;
  const messages = await Message.find({ conversation: conversation._id }).sort({ createdAt: 1 });
  ok(res, { conversation: present(conversation, req.user), messages });
};

// POST /api/conversations { propertyId, message } -> opens (or reuses) a chat with the owner
export const createConversation = async (req, res) => {
  const { value, error } = validateText(req.body.message);
  if (error) return fail(res, 400, error);
  if (!mongoose.isValidObjectId(req.body.propertyId)) return fail(res, 404, "Property not found.");

  const property = await Property.findById(req.body.propertyId);
  if (!property || property.status !== "published") return fail(res, 404, "This property is not available.");
  if (same(property.owner, req.user) || (property.ownerType === "admin" && req.user.role === "admin")) {
    return fail(res, 400, "This is your own listing.");
  }

  // One open conversation per customer and property keeps chats easy to follow
  let conversation = await Conversation.findOne({ customer: req.user._id, property: property._id, status: "open" });
  if (!conversation) {
    conversation = await Conversation.create({
      customer: req.user._id,
      owner: property.owner, // the real owner, taken from the property
      ownerType: property.ownerType,
      property: property._id,
    });
  }
  await addMessage(conversation, req.user, "customer", value);
  ok(res, present(await populate(Conversation.findById(conversation._id)), req.user), "Message sent", 201);
};

// POST /api/conversations/:id/messages { message }
export const sendMessage = async (req, res) => {
  const { value, error } = validateText(req.body.message);
  if (error) return fail(res, 400, error);
  const conversation = await loadAuthorized(req, res);
  if (!conversation) return;
  if (conversation.status === "closed") return fail(res, 400, "This conversation is closed.");
  const message = await addMessage(conversation, req.user, sideOf(conversation, req.user), value);
  ok(res, message, "Message sent", 201);
};

// PUT /api/conversations/:id/read -> clears the viewer's unread messages
export const markRead = async (req, res) => {
  const conversation = await loadAuthorized(req, res);
  if (!conversation) return;
  const side = sideOf(conversation, req.user);
  if (side === "customer") conversation.customerUnread = 0;
  else conversation.ownerUnread = 0;
  await conversation.save();
  await Message.updateMany({ conversation: conversation._id, sender: { $ne: req.user._id }, read: false }, { read: true });
  ok(res, present(conversation, req.user), "Marked as read");
};

// PUT /api/conversations/:id/close
export const closeConversation = async (req, res) => {
  const conversation = await loadAuthorized(req, res);
  if (!conversation) return;
  conversation.status = "closed";
  conversation.closedAt = new Date();
  await conversation.save();
  ok(res, present(conversation, req.user), "Conversation closed");
};
