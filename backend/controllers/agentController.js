import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import { updateInquiryStatus } from "./inquiryController.js";
import { ok, fail } from "../utils/response.js";

// GET /api/agents/dashboard -> one request with everything the dashboard needs
export const dashboard = async (req, res) => {
  const { access } = req;
  const [properties, inquiries] = await Promise.all([
    Property.find({ owner: req.user._id }).select("status views isFeatured"),
    Inquiry.find({ agent: req.user._id }).select("status"),
  ]);

  ok(res, {
    totalProperties: properties.length,
    activeProperties: access.isActive ? properties.filter((p) => p.status === "published").length : 0,
    pendingProperties: properties.filter((p) => p.status === "pending").length,
    draftProperties: properties.filter((p) => p.status === "draft").length,
    propertyViews: properties.reduce((sum, p) => sum + (p.views || 0), 0),
    newInquiries: inquiries.filter((i) => i.status === "new").length,
    totalInquiries: inquiries.length,
    subscription: access.subscription,
    subscriptionStatus: access.state.status,
    currentPlan: access.plan,
    expiresAt: access.subscription?.expiresAt || null,
    usage: {
      activeCount: access.activeCount,
      propertyLimit: access.propertyLimit,
      imageLimit: access.imageLimit,
      featuredCount: access.featuredCount,
      featuredLimit: access.featuredLimit,
    },
  });
};

// GET /api/agents/inquiries -> only inquiries about this agent's properties
export const agentInquiries = async (req, res) => {
  ok(res, await Inquiry.find({ agent: req.user._id }).sort({ createdAt: -1 }));
};

// PATCH /api/agents/inquiries/:id/status (plans with full inquiry management)
export const agentUpdateInquiry = async (req, res) => {
  if (!req.access.canManageInquiries) {
    return fail(res, 403, "Tracking inquiry status is available on Professional and Premium plans.");
  }
  const inquiry = await Inquiry.findOne({ _id: req.params.id, agent: req.user._id }).catch(() => null);
  if (!inquiry) return fail(res, 404, "Inquiry not found.");
  await updateInquiryStatus(inquiry, req.body.status, res);
};
