import mongoose from "mongoose";
import Inquiry from "../models/Inquiry.js";
import { loadPublishedProperty } from "../utils/ownership.js";
import { notifyOwner } from "../utils/notify.js";
import { postSystemNote } from "./chatController.js";
import { ok, fail } from "../utils/response.js";

export const INQUIRY_STATUSES = ["new", "contacted", "inProgress", "closed"];

// POST /api/inquiries (signed-in customers)
export const createInquiry = async (req, res) => {
  // Strings only, trimmed and length-limited: objects, arrays and oversized text are refused
  const str = (value) => (typeof value === "string" ? value.trim() : "");
  const name = str(req.body.name);
  const email = str(req.body.email).toLowerCase();
  const phone = str(req.body.phone);
  const message = str(req.body.message);
  if (!name || !message) return fail(res, 400, "Name and message are required.");
  if (name.length > 120 || message.length > 2000) return fail(res, 400, "Keep your name under 120 characters and your message under 2,000.");
  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, "Enter a valid email address.");
  if (phone && !/^\+?[\d\s().-]{7,20}$/.test(phone)) return fail(res, 400, "Enter a valid phone number.");
  if (!mongoose.isValidObjectId(req.body.propertyId)) return fail(res, 404, "This property is not available.");

  const property = await loadPublishedProperty(req.body.propertyId);
  if (!property) return fail(res, 404, "This property is not available.");
  const conversation = req.user ? await postSystemNote(property, req.user._id, req.user, "customer", `Property inquiry: ${message}`) : null;

  // The owner comes from the property, never from the request
  const inquiry = await Inquiry.create({
    customer: req.user?._id || null,
    property: property._id,
    agent: property.ownerType === "agent" ? property.owner : null,
    ownerType: property.ownerType,
    name,
    email,
    phone,
    message,
    conversation: conversation?._id || null,
    status: "new",
  });
  await notifyOwner({ owner: property.owner, ownerType: property.ownerType }, { type: "inquiry", title: "New property inquiry", message: `${name} asked about "${property.title}".`, path: "inquiries" });
  ok(res, inquiry, "Inquiry sent", 201);
};

// GET /api/users/inquiries (inquiries the signed-in customer sent)
export const myInquiries = async (req, res) => {
  const inquiries = await Inquiry.find({ customer: req.user._id }).sort({ createdAt: -1 });
  ok(res, inquiries);
};

// Shared status update used by agents (own inquiries) and admins (any inquiry)
export const updateInquiryStatus = async (inquiry, status, res) => {
  if (!INQUIRY_STATUSES.includes(status)) return fail(res, 400, "Invalid status.");
  inquiry.status = status;
  await inquiry.save();
  ok(res, inquiry, "Inquiry updated");
};
