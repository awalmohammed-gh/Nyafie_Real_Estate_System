import crypto from "node:crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import Conversation from "../models/Conversation.js";
import Offer from "../models/Offer.js";
import Rental from "../models/Rental.js";
import SaleRequest from "../models/SaleRequest.js";
import Viewing from "../models/Viewing.js";
import Subscription from "../models/Subscription.js";
import TeamInvite from "../models/TeamInvite.js";
import { paymentReturnUrl } from "../config/runtime.js";
import { getAgentAccess, subscriptionState } from "../utils/permissions.js";
import { canSeeAllAgencyWork } from "../utils/team.js";
import { endMembership } from "../utils/providerRemoval.js";
import { notifyUser } from "../utils/notify.js";
import { ok, fail } from "../utils/response.js";
import { loadUser } from "./authController.js";

const DAY = 24 * 60 * 60 * 1000;
const INVITE_DAYS = 7;
const ROLES = ["manager", "agent"];
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const MEMBER_FIELDS = "firstName lastName email phone profileImage agency createdAt";

// Only the agency owner manages the team, and only on an agency account
export const teamOwnerOnly = (req, res, next) => {
  if (!req.access.isOrganization || req.access.teamRole !== "owner") return fail(res, 403, "Only the account owner can manage the team.");
  next();
};
const pendingInvites = (ownerId) => TeamInvite.find({ agency: ownerId, usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });

// GET /api/agents/team (owner or manager): members with their numbers, open invites (owner) and the plan limit
export const listTeam = async (req, res) => {
  if (!req.access.isOrganization || !canSeeAllAgencyWork(req.user)) return fail(res, 403, "The team is available to agency and company owners and managers.");
  const ownerId = new mongoose.Types.ObjectId(String(req.access.ownerId));
  const [owner, members, listingStats, leadStats, invites] = await Promise.all([
    User.findById(ownerId).select("firstName lastName email phone profileImage"),
    User.find({ "agency.owner": ownerId }).select(MEMBER_FIELDS).sort({ "agency.joinedAt": 1 }),
    Property.aggregate([{ $match: { owner: ownerId } }, { $group: { _id: "$assignedTo", listings: { $sum: 1 }, published: { $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] } }, views: { $sum: "$views" } } }]),
    Inquiry.aggregate([{ $match: { agent: ownerId } }, { $group: { _id: "$assignedTo", leads: { $sum: 1 }, open: { $sum: { $cond: [{ $ne: ["$status", "closed"] }, 1, 0] } } } }]),
    req.access.teamRole === "owner" ? pendingInvites(ownerId) : [],
  ]);
  const stats = (id) => {
    const key = id ? String(id) : "null";
    const listing = listingStats.find((row) => String(row._id) === key) || {};
    const lead = leadStats.find((row) => String(row._id) === key) || {};
    return { listings: listing.listings || 0, published: listing.published || 0, views: listing.views || 0, leads: lead.leads || 0, openLeads: lead.open || 0 };
  };
  const person = (user, role, joinedAt) => ({ id: String(user._id), name: `${user.firstName} ${user.lastName}`, email: user.email, phone: user.phone || "", profileImage: user.profileImage || "", role, joinedAt });
  ok(res, {
    owner: { ...person(owner, "owner", owner.createdAt), stats: stats(null) }, // the owner's numbers are the unassigned work
    members: members.map((member) => ({ ...person(member, member.agency.role, member.agency.joinedAt), stats: stats(member._id) })),
    invites: invites.map((invite) => ({ id: String(invite._id), role: invite.role, expiresAt: invite.expiresAt, createdAt: invite.createdAt })),
    limit: req.access.teamMemberLimit,
    canInvite: req.access.isActive && members.length + invites.length < req.access.teamMemberLimit,
  });
};

// POST /api/agents/team/invites { role } (owner) -> a single-use link, shown once
export const createInvite = async (req, res) => {
  if (!req.access.isActive) return fail(res, 403, "Renew your subscription to invite team members.");
  const role = ROLES.includes(req.body.role) ? req.body.role : null;
  if (!role) return fail(res, 400, "Choose Manager or Agent.");
  const [members, open] = await Promise.all([User.countDocuments({ "agency.owner": req.access.ownerId }), TeamInvite.countDocuments({ agency: req.access.ownerId, usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } })]);
  const limit = req.access.teamMemberLimit;
  if (members + open >= limit) {
    return fail(res, 403, limit ? `Your ${req.access.plan.name} plan allows ${limit} team ${limit === 1 ? "member" : "members"}, including open invites. Upgrade your plan to add more.` : "Your plan doesn't include team members. Upgrade your plan to build a team.");
  }
  const token = crypto.randomBytes(24).toString("base64url");
  const invite = await TeamInvite.create({ agency: req.access.ownerId, role, tokenHash: hash(token), expiresAt: new Date(Date.now() + INVITE_DAYS * DAY) });
  ok(res, { id: String(invite._id), role, expiresAt: invite.expiresAt, url: `${paymentReturnUrl(req)}/agent/join/${token}` }, "Invite link created", 201);
};

// DELETE /api/agents/team/invites/:id (owner)
export const revokeInvite = async (req, res) => {
  const invite = mongoose.isValidObjectId(req.params.id) ? await TeamInvite.findOneAndUpdate({ _id: req.params.id, agency: req.access.ownerId, usedAt: null, revokedAt: null }, { revokedAt: new Date() }) : null;
  if (!invite) return fail(res, 404, "Invite not found.");
  ok(res, null, "Invite cancelled");
};

const loadMember = (req) => (mongoose.isValidObjectId(req.params.id) ? User.findOne({ _id: req.params.id, "agency.owner": req.access.ownerId }) : null);

// PATCH /api/agents/team/members/:id { role } (owner)
export const updateMember = async (req, res) => {
  const role = ROLES.includes(req.body.role) ? req.body.role : null;
  if (!role) return fail(res, 400, "Choose Manager or Agent.");
  const member = await loadMember(req);
  if (!member) return fail(res, 404, "Team member not found.");
  member.agency.role = role;
  await member.save();
  ok(res, { id: String(member._id), role }, "Role updated");
};

/**
 * DELETE /api/agents/team/members/:id (owner). Nothing is deleted: the member's listings and leads go
 * back to the owner. The account stays, without agency access; working on their own again needs
 * the usual agent application and admin approval.
 */
export const removeMember = async (req, res) => {
  const member = await loadMember(req);
  if (!member) return fail(res, 404, "Team member not found.");
  const back = { $set: { assignedTo: null } };
  const scope = { owner: req.access.ownerId, assignedTo: member._id };
  await Promise.all([
    Property.updateMany(scope, back),
    Inquiry.updateMany({ agent: req.access.ownerId, assignedTo: member._id }, back),
    Conversation.updateMany(scope, back),
    Offer.updateMany(scope, back),
    Rental.updateMany(scope, back),
    SaleRequest.updateMany(scope, back),
    Viewing.updateMany(scope, back),
  ]);
  await endMembership(member, "removed-by-owner"); // kept in the member's history
  await notifyUser(member._id, { type: "status", title: "You left the agency team", message: "Your account no longer has access to the agency's listings and leads.", link: "/agent/status" });
  ok(res, null, "Team member removed. Their listings and leads are back with you.");
};

// An invite that can still be used, with its agency, or null
const usableInvite = async (token) => {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const invite = await TeamInvite.findOne({ tokenHash: hash(token) });
  if (!invite || invite.usedAt || invite.revokedAt || invite.expiresAt <= new Date()) return null;
  const owner = await User.findById(invite.agency);
  const access = owner ? await getAgentAccess(owner) : null;
  if (!access?.isActive || !access.isOrganization || access.teamRole !== "owner") return null;
  return { invite, owner, access };
};

// GET /api/team/invites/:token (public) -> which agency invited you, for the join page
export const viewInvite = async (req, res) => {
  const found = await usableInvite(req.params.token);
  if (!found) return fail(res, 404, "This invite link is invalid or has expired. Ask the agency for a new one.");
  const { invite, owner } = found;
  ok(res, { agency: { name: owner.agentApplication?.companyName || `${owner.firstName} ${owner.lastName}`, logo: owner.agentApplication?.agencyLogo || "" }, role: invite.role, expiresAt: invite.expiresAt });
};

/**
 * POST /api/team/invites/:token/accept (agent session) -> join the agency.
 * The joining account must be an agent account that isn't working on its own: no listings, no active
 * plan, and not already in a team. The invite is used once, atomically.
 */
export const acceptInvite = async (req, res) => {
  const found = await usableInvite(req.params.token);
  if (!found) return fail(res, 404, "This invite link is invalid or has expired. Ask the agency for a new one.");
  const { invite, owner, access } = found;
  const user = req.user;
  if (user.role !== "agent" || !user.isActive) return fail(res, 403, "Sign in with an agent account to join an agency.");
  // Joining approves the account, so it must not override an admin's decision about it
  if (["rejected", "suspended", "removed"].includes(user.agentApplication?.status)) return fail(res, 403, "This account's agent application was declined, so it can't join an agency. Contact support.");
  if (String(user._id) === String(owner._id)) return fail(res, 400, "This is your own agency.");
  if (user.agency?.owner) return fail(res, 409, "Your account is already part of an agency team.");
  const [listings, subscription] = await Promise.all([Property.exists({ owner: user._id }), user.subscription ? Subscription.findById(user.subscription) : null]);
  if (listings || subscription && subscriptionState(subscription).isActive) return fail(res, 409, "This account has its own listings or plan. Use a separate agent account to join an agency team.");
  if ((await User.countDocuments({ "agency.owner": owner._id })) >= access.teamMemberLimit) return fail(res, 403, "This agency's team is full. Ask the agency owner to upgrade their plan.");

  const claimed = await TeamInvite.findOneAndUpdate({ _id: invite._id, usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }, { usedAt: new Date(), usedBy: user._id }, { returnDocument: "after" });
  if (!claimed) return fail(res, 404, "This invite link was already used.");
  const now = new Date();
  await User.updateOne({ _id: user._id, role: "agent", agency: { $exists: false } }, {
    $set: {
      agency: { owner: owner._id, role: invite.role, joinedAt: now },
      // Joining is approved by the agency owner; the agency's admin approval and plan cover the member
      "agentApplication.status": "approved",
      "agentApplication.agentType": access.accountType, // agency or company, like the organisation they join
      "agentApplication.companyName": owner.agentApplication?.companyName || "",
      "agentApplication.approvedAt": now,
      "agentApplication.approvedBy": owner._id,
      "agentApplication.profileCompletedAt": user.agentApplication?.profileCompletedAt || now,
    },
  });
  await notifyUser(owner._id, { type: "user", title: "New team member", message: `${user.firstName} ${user.lastName} joined your agency as ${invite.role === "manager" ? "a manager" : "an agent"}.`, link: "/agent/team" });
  ok(res, await loadUser(user._id), "Welcome to the team");
};
