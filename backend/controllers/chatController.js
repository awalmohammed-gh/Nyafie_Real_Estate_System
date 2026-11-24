import Property from "../models/Property.js";
import { choice, fullNameMatch, pageOf, pageResult, searchPattern } from "../utils/listPage.js";
import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message, { MAX_MESSAGE_LENGTH } from "../models/Message.js";
import Offer from "../models/Offer.js";
import { notifyOwner, notifyUser } from "../utils/notify.js";
import { ok, fail } from "../utils/response.js";
import { siteName } from "../models/Setting.js";
import { isOwnListing, loadPublishedProperty, populateRequest } from "../utils/ownership.js";
import { canHandleTeamRecord, teamFilter } from "../utils/team.js";
import User from "../models/User.js";
import { chatEnabledAgents } from "../utils/permissions.js";

const same = (a, b) => a && b && String(a._id || a) === String(b._id || b);

/**
 * Which side of the conversation the signed-in account is on, or null when it
 * has no access. This single check guards every chat read and write:
 *  - customers: their own conversations
 *  - agents:    conversations about their own properties (agency staff: as their role allows)
 *  - admins:    conversations about admin-owned properties (never agent ones)
 */
const sideOf = (conversation, user) => {
  if (same(conversation.customer, user)) return "customer";
  if (user.$locals?.sessionDomain === "customer") return null;
  if (conversation.ownerType === "agent" && canHandleTeamRecord(conversation, user)) return "owner";
  if (conversation.ownerType === "admin" && user.role === "admin") return "owner";
  return null;
};

/**
 * NyaFie chat is a plan feature for agents (inquiries, phone, email and WhatsApp always work).
 * Returns the ids of the given agents whose current plan includes chat. Admin listings always have chat.
 * Automatic notes about offers and rentals are records, not chat, so they are never blocked.
 */
const agentsWithChat = async (ownerIds) => {
  const ids = [...new Set(ownerIds.filter(Boolean).map(String))];
  if (!ids.length) return new Set();
  return chatEnabledAgents(await User.find({ _id: { $in: ids } }).select("role isActive subscription agentApplication.agentType"));
};
const ownerId = (conversation) => String(conversation.owner?._id || conversation.owner || "");
const chatOpen = (conversation, enabled) => conversation.ownerType === "admin" || enabled.has(ownerId(conversation));
// One conversation for the viewer, with its real chat state
const presentOne = async (conversation, user) =>
  present(conversation, user, conversation.ownerType === "agent" ? await agentsWithChat([ownerId(conversation)]) : new Set());
const CHAT_LOCKED = {
  customer: "This agent isn't using NyaFie chat. Send an inquiry, or call, email or WhatsApp them instead.",
  owner: "Upgrade your subscription to message customers through NyaFie.",
};

// No owner id here: present() returns the conversation as stored, and customers only see public owner details
const PROPERTY_FIELDS = "title images location price pricePeriod listingType status availability ownerType contact";

// Shapes a conversation for the viewer (customers only see public owner details)
const present = (conversation, user, enabled = new Set()) => {
  const side = sideOf(conversation, user);
  const c = conversation.toJSON();
  const customer = conversation.customer;
  const owner = conversation.owner;
  return {
    ...c,
    side,
    chatEnabled: chatOpen(conversation, enabled),
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
        ? { id: "admin", name: siteName(), type: "admin" }
        : { id: String(owner?._id || owner), name: owner?.firstName ? `${owner.firstName} ${owner.lastName}` : "Agent", type: "agent" },
  };
};

const populate = (query) => populateRequest(query, PROPERTY_FIELDS);

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
// System notes from offers, rentals and sale requests pass { notify: false } because those send their own notification.
// With a transaction `session`, the message and the summary commit together (callers inside a
// transaction pass notify: false and send their notifications after it commits).
export const addMessage = async (conversation, user, side, text, { notify = true, session = null } = {}) => {
  const [message] = await Message.create([{ conversation: conversation._id, sender: user._id, message: text }], { session });
  conversation.lastMessage = text.length > 140 ? `${text.slice(0, 137)}...` : text;
  conversation.lastMessageAt = message.createdAt;
  conversation.lastSender = user._id;
  if (side === "customer") conversation.ownerUnread += 1;
  else conversation.customerUnread += 1;
  await conversation.save({ session });

  if (notify) {
    const preview = conversation.lastMessage;
    const key = `chat:${conversation._id}:${side === "customer" ? "owner" : "customer"}`;
    if (side === "customer") {
      await notifyOwner(conversation, { type: "message", title: `New message from ${user.firstName}`, message: preview, path: `messages?c=${conversation._id}`, key });
    } else {
      await notifyUser(conversation.customer?._id || conversation.customer, { type: "message", title: "New reply to your chat", message: preview, link: `/account/messages?c=${conversation._id}`, key });
    }
  }
  return message;
};

// One open conversation per customer and property keeps chats easy to follow.
// Also used by offers and rentals so the owner hears about them in their inbox.
export const openConversation = async (property, customerId, session = null) => {
  const existing = await Conversation.findOne({ customer: customerId, property: property._id, status: "open" }).session(session);
  if (existing) return existing;
  const [created] = await Conversation.create([{
    customer: customerId,
    owner: property.owner, // the real owner, taken from the property
    assignedTo: property.assignedTo || null, // the agency staff member handling the listing
    ownerType: property.ownerType,
    property: property._id,
  }], { session });
  return created;
};

// Posts an automatic note (offer made, rental paid, status changed...) into the
// customer/owner conversation for a property and returns the conversation.
// Pass the transaction's `session` to make the note part of the change it describes.
export const postSystemNote = async (property, customerId, user, side, text, session = null) => {
  const conversation = await openConversation(property, customerId, session);
  await addMessage(conversation, user, side, text, { notify: false, session });
  return conversation;
};

// GET /api/conversations?scope=customer|owner (plus the /messages aliases) -> a page of conversations
export const listConversations = (scopeOverride) => async (req, res) => {
  const scope = scopeOverride || req.query.scope || "customer";
  let filter;
  if (scope === "customer") filter = { customer: req.user._id };
  else if (req.sessionDomain === "customer") return ok(res, pageResult([], 0, pageOf(req.query), { counts: { all: 0, unread: 0, closed: 0 }, empty: true }));
  else if (req.user.role === "admin") filter = { ownerType: "admin" };
  else if (req.user.role === "agent") filter = { ownerType: "agent", ...teamFilter(req.user) };
  else return ok(res, pageResult([], 0, pageOf(req.query), { counts: { all: 0, unread: 0, closed: 0 }, empty: true })); // customers own no listings

  // Which conversations: ?page, tab=all|unread|closed, search (the other person, the listing or the last message)
  const paging = pageOf(req.query), pattern = searchPattern(req.query.search);
  const unread = { [scope === "customer" ? "customerUnread" : "ownerUnread"]: { $gt: 0 } };
  const tabs = { all: { status: "open" }, unread: { status: "open", ...unread }, closed: { status: "closed" } };
  const tab = choice(req.query.tab, Object.keys(tabs));
  const search = [];
  if (pattern) {
    const [people, listings] = await Promise.all([
      User.find({ $expr: fullNameMatch(pattern) }).select("_id").limit(500).lean(),
      Property.find({ title: pattern }).select("_id").limit(500).lean(),
    ]);
    const ids = people.map((user) => user._id);
    const counterpart = scope !== "customer" ? [{ customer: { $in: ids } }] : [{ ownerType: "agent", owner: { $in: ids } }, ...(pattern.test(siteName()) ? [{ ownerType: "admin" }] : [])];
    search.push({ $or: [{ lastMessage: pattern }, { property: { $in: listings.map((listing) => listing._id) } }, ...counterpart] });
  }
  const shown = { $and: [filter, tabs[tab], ...search] };
  const [total, conversations, any, ...counted] = await Promise.all([
    Conversation.countDocuments(shown),
    populate(Conversation.find(shown).sort({ lastMessageAt: -1, _id: -1 }).skip(paging.skip).limit(paging.limit)),
    Conversation.exists(filter),
    ...Object.values(tabs).map((tabFilter) => Conversation.countDocuments({ $and: [filter, tabFilter] })),
  ]);
  const enabled = await agentsWithChat(conversations.filter((c) => c.ownerType === "agent").map(ownerId));
  ok(res, pageResult(conversations.map((c) => present(c, req.user, enabled)), total, paging, {
    counts: Object.fromEntries(Object.keys(tabs).map((name, index) => [name, counted[index]])),
    empty: !any,
  }));
};

// Messages per request: the latest, then earlier ones on demand (open chats ask for them every few seconds)
const MESSAGE_PAGE = 100;

// GET /api/conversations/:id?before=<message id> -> conversation + its latest messages (or those before one)
export const getConversation = async (req, res) => {
  const conversation = await loadAuthorized(req, res);
  if (!conversation) return;
  const { before } = req.query;
  let earlier = {};
  if (before !== undefined) {
    const from = typeof before === "string" && mongoose.isValidObjectId(before) ? await Message.findOne({ _id: before, conversation: conversation._id }).select("createdAt").lean() : null;
    if (!from) return fail(res, 400, "Unknown message.");
    earlier = { $or: [{ createdAt: { $lt: from.createdAt } }, { createdAt: from.createdAt, _id: { $lt: from._id } }] };
  }
  const [page, offer] = await Promise.all([
    Message.find({ conversation: conversation._id, ...earlier }).sort({ createdAt: -1, _id: -1 }).limit(MESSAGE_PAGE + 1),
    // The customer's latest live offer on this property, shown above the chat
    Offer.findOne({ customer: conversation.customer?._id || conversation.customer, property: conversation.property?._id || conversation.property, status: { $ne: "withdrawn" } })
      .sort({ createdAt: -1 })
      .select("amount askingPrice status counterAmount"),
  ]);
  const enabled = conversation.ownerType === "agent" ? await agentsWithChat([ownerId(conversation)]) : new Set();
  const messages = page.slice(0, MESSAGE_PAGE).reverse();
  ok(res, { conversation: present(conversation, req.user, enabled), messages, hasEarlier: page.length > MESSAGE_PAGE, offer });
};

// POST /api/conversations { propertyId, message } -> opens (or reuses) a chat with the owner
export const createConversation = async (req, res) => {
  const { value, error } = validateText(req.body.message);
  if (error) return fail(res, 400, error);
  if (!mongoose.isValidObjectId(req.body.propertyId)) return fail(res, 404, "Property not found.");

  const property = await loadPublishedProperty(req.body.propertyId);
  if (!property) return fail(res, 404, "This property is not available.");
  if (isOwnListing(property, req.user)) {
    return fail(res, 400, "This is your own listing.");
  }
  const enabled = property.ownerType === "agent" ? await agentsWithChat([property.owner]) : new Set();
  if (property.ownerType === "agent" && !enabled.has(String(property.owner))) return fail(res, 403, CHAT_LOCKED.customer);

  const conversation = await openConversation(property, req.user._id);
  await addMessage(conversation, req.user, "customer", value);
  ok(res, present(await populate(Conversation.findById(conversation._id)), req.user, enabled), "Message sent", 201);
};

// POST /api/conversations/:id/messages { message }
export const sendMessage = async (req, res) => {
  const { value, error } = validateText(req.body.message);
  if (error) return fail(res, 400, error);
  const conversation = await loadAuthorized(req, res);
  if (!conversation) return;
  if (conversation.status === "closed") return fail(res, 400, "This conversation is closed.");
  const side = sideOf(conversation, req.user);
  if (conversation.ownerType === "agent" && !(await agentsWithChat([ownerId(conversation)])).has(ownerId(conversation))) return fail(res, 403, CHAT_LOCKED[side]);
  const message = await addMessage(conversation, req.user, side, value);
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
  ok(res, await presentOne(conversation, req.user), "Marked as read");
};

// PUT /api/conversations/:id/close
export const closeConversation = async (req, res) => {
  const conversation = await loadAuthorized(req, res);
  if (!conversation) return;
  conversation.status = "closed";
  conversation.closedAt = new Date();
  await conversation.save();
  ok(res, await presentOne(conversation, req.user), "Conversation closed");
};
