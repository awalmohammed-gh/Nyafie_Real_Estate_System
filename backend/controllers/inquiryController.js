import Inquiry from "../models/Inquiry.js";
import Property from "../models/Property.js";
import { ok, fail } from "../utils/response.js";

export const INQUIRY_STATUSES = ["new", "contacted", "inProgress", "closed"];

// POST /api/inquiries (guests or signed-in customers)
export const createInquiry = async (req, res) => {
  const { propertyId, name, email, phone = "", message } = req.body;
  if (!name?.trim() || !message?.trim()) return fail(res, 400, "Name and message are required.");
  if (!/^\S+@\S+\.\S+$/.test(String(email || ""))) return fail(res, 400, "Enter a valid email address.");

  const property = await Property.findById(propertyId).catch(() => null);
  if (!property || property.status !== "published") return fail(res, 404, "This property is not available.");

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
    status: "new",
  });
  ok(res, inquiry, "Inquiry sent", 201);
};

// GET /api/users/inquiries (inquiries the signed-in customer sent)
export const myInquiries = async (req, res) => {
  const inquiries = await Inquiry.find({ $or: [{ customer: req.user._id }, { email: req.user.email }] }).sort({ createdAt: -1 });
  ok(res, inquiries);
};

// Shared status update used by agents (own inquiries) and admins (any inquiry)
export const updateInquiryStatus = async (inquiry, status, res) => {
  if (!INQUIRY_STATUSES.includes(status)) return fail(res, 400, "Invalid status.");
  inquiry.status = status;
  await inquiry.save();
  ok(res, inquiry, "Inquiry updated");
};
