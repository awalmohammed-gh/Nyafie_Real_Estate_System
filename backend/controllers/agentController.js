import mongoose from "mongoose";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";
import { updateInquiryStatus } from "./inquiryController.js";
import { ok, fail } from "../utils/response.js";
import { canSeeAllAgencyWork, teamFilter } from "../utils/team.js";

// GET /api/agents/dashboard -> one request with everything the dashboard needs
// (agency staff see the agency's numbers for the work their role covers)
export const dashboard = async (req, res) => {
  const { access } = req;
  const [properties, inquiries] = await Promise.all([
    Property.find(teamFilter(req.user)).select("status views isFeatured"),
    Inquiry.find(teamFilter(req.user, "agent")).select("status"),
  ]);
  const isOwner = access.teamRole === "owner";

  ok(res, {
    totalProperties: properties.length,
    activeProperties: access.isActive ? properties.filter((p) => p.status === "published").length : 0,
    pendingProperties: properties.filter((p) => p.status === "pending").length,
    draftProperties: properties.filter((p) => p.status === "draft").length,
    propertyViews: properties.reduce((sum, p) => sum + (p.views || 0), 0),
    newInquiries: inquiries.filter((i) => i.status === "new").length,
    totalInquiries: inquiries.length,
    // Billing details are for the account owner only
    subscription: isOwner ? access.subscription : null,
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

// GET /api/agents/inquiries -> inquiries about this agent's (or agency's) properties, as their role allows
export const agentInquiries = async (req, res) => {
  ok(res, await Inquiry.find(teamFilter(req.user, "agent")).sort({ createdAt: -1 }));
};

// PATCH /api/agents/inquiries/:id/status (plans with full inquiry management)
export const agentUpdateInquiry = async (req, res) => {
  if (!req.access.canManageInquiries) {
    return fail(res, 403, "Tracking inquiry status is available on plans with full inquiry management.");
  }
  const inquiry = mongoose.isValidObjectId(req.params.id) ? await Inquiry.findOne({ _id: req.params.id, ...teamFilter(req.user, "agent") }) : null;
  if (!inquiry) return fail(res, 404, "Inquiry not found.");
  await updateInquiryStatus(inquiry, req.body.status, res);
};

/**
 * Who in the agency may be given work: the owner (null) or one of the agency's own staff.
 * Returns the member id, null for the owner, or undefined when the request names someone else.
 */
export const agencyAssignee = async (ownerId, memberId) => {
  if (memberId === null || memberId === "" || memberId === undefined || String(memberId) === String(ownerId)) return null;
  if (!mongoose.isValidObjectId(memberId)) return undefined;
  const member = await User.exists({ _id: memberId, role: "agent", "agency.owner": ownerId });
  return member ? member._id : undefined;
};

// PATCH /api/agents/inquiries/:id/assign { memberId } (agency owner or manager) -> hand a lead to a team member
export const assignInquiry = async (req, res) => {
  if (!canSeeAllAgencyWork(req.user) || !req.access.isOrganization) return fail(res, 403, "Only the owner or a manager can assign leads.");
  const inquiry = mongoose.isValidObjectId(req.params.id) ? await Inquiry.findOne({ _id: req.params.id, agent: req.access.ownerId }) : null;
  if (!inquiry) return fail(res, 404, "Inquiry not found.");
  const assignee = await agencyAssignee(req.access.ownerId, req.body.memberId);
  if (assignee === undefined) return fail(res, 400, "Choose a member of your agency.");
  inquiry.assignedTo = assignee;
  await inquiry.save();
  // The chat that came with the inquiry follows it
  if (inquiry.conversation) await Conversation.updateOne({ _id: inquiry.conversation, owner: req.access.ownerId }, { $set: { assignedTo: assignee } });
  ok(res, inquiry, "Lead assigned");
};
