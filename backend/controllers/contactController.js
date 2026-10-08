import mongoose from "mongoose";
import ContactMessage, { CONTACT_STATUSES } from "../models/ContactMessage.js";
import { notifyAdmins } from "../utils/notify.js";
import { ok, fail } from "../utils/response.js";

const trim = (value) => typeof value === "string" ? value.trim() : "";
const present = (message) => ({ id: String(message._id), name: message.name, email: message.email, phone: message.phone, subject: message.subject, message: message.message, status: message.status, createdAt: message.createdAt });

// Guests can write to the business; general messages never enter property/agent inboxes.
export const createContactMessage = async (req, res) => {
  const body = req.body || {};
  const fields = { name: trim(body.name), email: trim(body.email).toLowerCase(), phone: trim(body.phone), subject: trim(body.subject), message: trim(body.message) };
  if (!fields.name || fields.name.length > 120) return fail(res, 400, "Enter your name using at most 120 characters.");
  if (fields.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return fail(res, 400, "Enter a valid email address.");
  if (fields.phone && !/^\+?[\d\s().-]{7,30}$/.test(fields.phone)) return fail(res, 400, "Enter a valid phone number, or leave it blank.");
  if (!fields.subject || fields.subject.length > 120) return fail(res, 400, "Choose a topic or enter a subject using at most 120 characters.");
  if (!fields.message || fields.message.length > 4000) return fail(res, 400, "Enter a message using at most 4,000 characters.");
  const message = await ContactMessage.create(fields);
  await notifyAdmins({ type: "message", title: "New contact message", message: `${fields.name}: ${fields.subject}`, link: "/admin/contact-messages" });
  ok(res, { id: String(message._id) }, "Your message has been received.", 201);
};

export const listContactMessages = async (req, res) => {
  const { status = "all", search = "", page: requestedPage = "1" } = req.query;
  if (typeof status !== "string" || (status !== "all" && !CONTACT_STATUSES.includes(status))) return fail(res, 400, "Invalid status filter.");
  if (typeof search !== "string" || search.length > 200) return fail(res, 400, "Keep the search under 200 characters.");
  const page = Number(requestedPage);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return fail(res, 400, "Invalid page.");
  const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const scope = escaped ? { $or: ["name", "email", "subject", "message"].map((key) => ({ [key]: new RegExp(escaped, "i") })) } : {};
  const filter = { ...scope, ...(status === "all" ? {} : { status }) };
  const limit = 20;
  const [messages, total, groups] = await Promise.all([
    ContactMessage.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ContactMessage.countDocuments(filter),
    ContactMessage.aggregate([{ $match: scope }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  const counts = Object.fromEntries(CONTACT_STATUSES.map((key) => [key, 0]));
  for (const group of groups) counts[group._id] = group.count;
  counts.all = Object.values(counts).reduce((sum, value) => sum + value, 0);
  ok(res, { items: messages.map(present), counts, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
};

export const setContactMessageStatus = async (req, res) => {
  if (!CONTACT_STATUSES.includes(req.body?.status)) return fail(res, 400, "Invalid status.");
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Message not found.");
  const message = await ContactMessage.findById(req.params.id);
  if (!message) return fail(res, 404, "Message not found.");
  message.status = req.body.status;
  await message.save();
  ok(res, present(message), "Message status updated.");
};
