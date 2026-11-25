import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Offer from "../models/Offer.js";
import Rental from "../models/Rental.js";
import SaleRequest from "../models/SaleRequest.js";
import Viewing from "../models/Viewing.js";
import Payment from "../models/Payment.js";
import Review from "../models/Review.js";
import Subscription from "../models/Subscription.js";
import TeamInvite from "../models/TeamInvite.js";
import Notification from "../models/Notification.js";
import { HttpError } from "./response.js";
import { notifyUser } from "./notify.js";
import { deleteSessions, endSessions } from "./sessions.js";
import { accountTypeOf, subscriptionState } from "./permissions.js";
import { isOrganization, ACCOUNT_LABELS } from "./accountTypes.js";
import { isRemoved } from "./agentApplication.js";
import { deleteDocumentChecks, destroyDocuments } from "./propertyDocuments.js";
import { destroyListingMedia, listingImages } from "./listingMedia.js";

/**
 * Taking a provider (individual agent, agency or company, or one of their staff) off NyaFie.
 *
 * Remove (the normal action) ends access and public presence but keeps every record:
 *   account removed (no sign-in, existing tokens stop working) -> listings hidden -> staff memberships
 *   ended (their own accounts stay) -> open invites revoked -> plan cancelled -> open chats closed.
 * Restore undoes the account part only; listings, team and plan are each brought back deliberately.
 * Permanently delete (a separate, later step) erases the personal details and only the records nobody
 * else depends on. Money, customer and team history is always kept, pointing at an anonymous record.
 */

export const REMOVAL_REASONS = { fraud: "Fraud", policy: "Policy violation", duplicate: "Duplicate account", closed: "Business closed", other: "Other" };
const HIDDEN_STATES = ["published", "pending"]; // what the public or the review queue can see
const STAFF_WORK = [Property, Conversation, Offer, Rental, SaleRequest, Viewing]; // records with owner + assignedTo
const DELETED_NAME = { firstName: "Deleted", lastName: "agent" };

const idOf = (value) => value?._id || value;
const normalise = (text) => String(text || "").trim().replace(/\s+/g, " ").toUpperCase();
export const providerName = (user) =>
  (isOrganization(accountTypeOf(user)) && !user.agency?.owner && user.agentApplication?.companyName) || `${user.firstName} ${user.lastName}`.trim();
// What the admin types to confirm a permanent delete
export const deleteConfirmation = (user) => `DELETE ${normalise(providerName(user))}`;

const loadProvider = async (id) => {
  const user = await User.findById(id).catch(() => null);
  if (!user || user.role !== "agent") throw new HttpError(404, "Agent not found.");
  return user;
};

// A staff member's assigned work goes back to the organisation owner (one step at a time, so it
// can run inside a transaction: pass its `session`)
export const unassign = async (ownerId, memberId, session = null) => {
  for (const Model of STAFF_WORK) await Model.updateMany({ owner: ownerId, assignedTo: memberId }, { $set: { assignedTo: null } }, { session });
  await Inquiry.updateMany({ agent: ownerId, assignedTo: memberId }, { $set: { assignedTo: null } }, { session });
};

/**
 * Ends a live organisation membership. The member keeps their own NyaFie account; the membership
 * moves to their history and they become an individual applicant again (a new plan or invite brings
 * them back). `extra` adds to the update, e.g. removing the member's account too.
 */
export const endMembership = (member, reason, now = new Date(), extra = {}, session = null) => {
  const ownerId = idOf(member.agency.owner);
  return User.updateOne({ _id: member._id, "agency.owner": ownerId }, {
    $unset: { agency: 1 },
    $push: { pastMemberships: { owner: ownerId, role: member.agency.role, joinedAt: member.agency.joinedAt, endedAt: now, reason } },
    $set: { "agentApplication.status": "incomplete", "agentApplication.agentType": "individual", "agentApplication.companyName": "", "agentApplication.approvedAt": null, "agentApplication.approvedBy": null, ...extra },
  }, { session });
};

// GET: what removing this provider will do, for the admin's confirmation dialog
export const removalImpact = async (id) => {
  const user = await loadProvider(id);
  const accountType = accountTypeOf(user);
  if (user.agency?.owner) {
    const ownerId = idOf(user.agency.owner);
    const owner = await User.findById(ownerId).select("firstName lastName agentApplication");
    const assigned = (await Promise.all([...STAFF_WORK.map((Model) => Model.countDocuments({ owner: ownerId, assignedTo: user._id })), Inquiry.countDocuments({ agent: ownerId, assignedTo: user._id })])).reduce((a, b) => a + b, 0);
    return { kind: "staff", name: providerName(user), accountType, organisation: owner ? providerName(owner) : "", role: user.agency.role, assignedWork: assigned, removed: isRemoved(user) };
  }
  const subscription = user.subscription ? await Subscription.findById(user.subscription) : null;
  const [listings, hiddenByRemoval, staff, invites, conversations] = await Promise.all([
    Property.countDocuments({ owner: user._id, ownerType: "agent", status: { $in: HIDDEN_STATES } }),
    Property.countDocuments({ owner: user._id, status: "suspended", "providerRemoval.statusBefore": { $in: HIDDEN_STATES } }),
    User.countDocuments({ "agency.owner": user._id }),
    TeamInvite.countDocuments({ agency: user._id, usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }),
    Conversation.countDocuments({ owner: user._id, status: "open" }),
  ]);
  return {
    kind: isOrganization(accountType) ? "organisation" : "individual",
    name: providerName(user),
    accountType,
    accountLabel: ACCOUNT_LABELS[accountType],
    listings,
    hiddenByRemoval, // listings a restore can bring back
    staff,
    invites,
    conversations,
    subscription: subscriptionState(subscription).isActive ? { planName: subscription.planName, expiresAt: subscription.expiresAt } : null,
    removed: isRemoved(user),
  };
};

/**
 * Removes a provider. Access ends first, in one atomic update (so two admins can't both run it and
 * nothing else happens for an account that's still usable); the clean-up steps after it only ever
 * change state, never delete.
 */
export const removeProvider = async (id, admin, { reason, note } = {}) => {
  if (!Object.hasOwn(REMOVAL_REASONS, reason)) throw new HttpError(400, "Choose a reason for removing this provider.");
  if (note !== undefined && (typeof note !== "string" || note.trim().length > 1000)) throw new HttpError(400, "Keep the note under 1,000 characters.");
  const user = await loadProvider(id);
  if (isRemoved(user)) throw new HttpError(409, "This provider has already been removed.");
  const now = new Date();
  const staffOf = user.agency?.owner ? idOf(user.agency.owner) : null;
  const removal = { removedAt: now, removedBy: admin._id, reason, note: (note || "").trim(), statusBefore: user.agentApplication?.status || "incomplete", wasStaffOf: staffOf };

  // One transaction: the account, its listings, team, invites, chats and plan change together, so a
  // failure never leaves a removed provider with listings still live (or the reverse)
  const outcome = await mongoose.connection.transaction(async (session) => {
    const locked = await User.findOneAndUpdate(
      { _id: user._id, role: "agent", "agentApplication.status": { $ne: "removed" } },
      {
        $set: { isActive: false, "agentApplication.status": "removed", removal, ...(staffOf ? { "agentApplication.agentType": "individual", "agentApplication.companyName": "" } : {}) },
        ...(staffOf ? {
          $unset: { agency: 1 },
          $push: { pastMemberships: { owner: staffOf, role: user.agency.role, joinedAt: user.agency.joinedAt, endedAt: now, reason: "member-removed" } },
        } : {}),
      },
      { returnDocument: "after", session },
    );
    if (!locked) throw new HttpError(409, "This provider has already been removed.");

    // A staff member: the organisation carries on; their assigned work goes back to its owner
    if (staffOf) {
      await unassign(staffOf, user._id, session);
      return { summary: { kind: "staff", name: providerName(user) }, released: [] };
    }

    // An individual, agency or company: listings off the marketplace, team released, plan stopped
    let listingsHidden = 0;
    for (const status of HIDDEN_STATES) {
      listingsHidden += (await Property.updateMany({ owner: user._id, ownerType: "agent", status }, { $set: { status: "suspended", providerRemoval: { hiddenAt: now, statusBefore: status } } }, { session })).modifiedCount || 0;
    }
    const invites = await TeamInvite.updateMany({ agency: user._id, usedAt: null, revokedAt: null }, { $set: { revokedAt: now } }, { session });
    const conversations = await Conversation.updateMany({ owner: user._id, status: "open" }, { $set: { status: "closed", closedAt: now } }, { session });
    const subscriptions = await Subscription.updateMany({ user: user._id, status: "active" }, { $set: { status: "cancelled", cancelledAt: now } }, { session });
    const staff = await User.find({ "agency.owner": user._id }).session(session);
    for (const member of staff) await endMembership(member, "organisation-removed", now, {}, session);
    return {
      summary: {
        kind: isOrganization(accountTypeOf(user)) ? "organisation" : "individual",
        name: providerName(user),
        listingsHidden,
        staffReleased: staff.length,
        invitesRevoked: invites.modifiedCount || 0,
        conversationsClosed: conversations.modifiedCount || 0,
        subscriptionCancelled: (subscriptions.modifiedCount || 0) > 0,
      },
      released: staff.map((member) => member._id),
    };
  });

  await endSessions(user._id, "removed"); // on every device
  // People are told only once the removal is saved
  if (staffOf) {
    await notifyUser(staffOf, { type: "user", title: "A team member was removed", message: `NyaFie removed ${providerName(user)} from your team. Their assigned listings and leads are back with you.`, link: "/agent/team" });
  }
  for (const memberId of outcome.released) {
    await notifyUser(memberId, { type: "status", title: "You no longer have access to this organisation", message: `${providerName(user)} is no longer on NyaFie. Your own account is still yours: choose a plan to keep listing, or join another team.`, link: "/agent/status" });
  }
  return outcome.summary;
};

/**
 * Restores a removed provider's account. Nothing else comes back on its own: listings return only
 * when the admin asks (`republish`), staff need a new invite, and the plan is managed separately.
 */
export const restoreProvider = async (id, admin, { republish = false } = {}) => {
  const user = await loadProvider(id);
  if (!isRemoved(user)) throw new HttpError(409, "This provider isn't removed.");
  if (user.removal?.deletedAt) throw new HttpError(409, "This provider's details were permanently deleted and can't be restored.");
  const before = user.removal?.statusBefore;
  // Former staff come back as individual applicants; others return to where they were
  const status = user.removal?.wasStaffOf || !before || before === "removed" ? "incomplete" : before;
  // The account and (when asked) its listings come back together
  return mongoose.connection.transaction(async (session) => {
    const restored = await User.findOneAndUpdate(
      { _id: user._id, "agentApplication.status": "removed" },
      { $set: { "agentApplication.status": status, isActive: status !== "suspended", "removal.restoredAt": new Date(), "removal.restoredBy": admin._id } },
      { returnDocument: "after", session },
    );
    if (!restored) throw new HttpError(409, "This provider isn't removed.");
    let republished = 0;
    if (republish === true) {
      for (const state of HIDDEN_STATES) {
        republished += (await Property.updateMany({ owner: user._id, status: "suspended", "providerRemoval.statusBefore": state }, { $set: { status: state }, $unset: { providerRemoval: 1 } }, { session })).modifiedCount || 0;
      }
    }
    return { name: providerName(restored), status, republished };
  });
};

// Who else's records point at this account, and the listings that customers or payments depend on
const references = async (user) => {
  const id = user._id;
  const mine = { $or: [{ owner: id }, { assignedTo: id }] };
  const listings = await Property.find({ owner: id, ownerType: "agent" }).select("_id");
  const listingIds = listings.map((p) => p._id);
  const onListings = { property: { $in: listingIds } };
  const used = new Set((await Promise.all([Inquiry, Conversation, Offer, Rental, SaleRequest, Payment, Review, Viewing].map((Model) => Model.distinct("property", onListings)))).flat().map(String));
  const keep = listingIds.filter((pid) => used.has(String(pid)));
  const drop = listingIds.filter((pid) => !used.has(String(pid)));
  const [inquiries, conversations, messages, offers, rentals, sales, payments, paidPlans, pendingPlans, failedPlans, invites, notifications, teamHistory, actions] = await Promise.all([
    Inquiry.countDocuments({ $or: [{ agent: id }, { assignedTo: id }] }),
    Conversation.countDocuments(mine),
    Message.countDocuments({ sender: id }),
    Offer.countDocuments(mine),
    Rental.countDocuments(mine),
    SaleRequest.countDocuments(mine),
    Payment.countDocuments({ $or: [{ owner: id }, { confirmedBy: id }] }),
    Subscription.countDocuments({ user: id, paymentStatus: { $in: ["paid", "waived"] } }),
    Subscription.countDocuments({ user: id, paymentStatus: "pending" }),
    Subscription.countDocuments({ user: id, paymentStatus: "failed" }),
    TeamInvite.countDocuments({ $or: [{ agency: id }, { usedBy: id }] }),
    Notification.countDocuments({ recipient: id }),
    User.countDocuments({ $or: [{ "pastMemberships.owner": id }, { "agency.owner": id }] }),
    Promise.all([Rental.countDocuments({ "history.by": id }), SaleRequest.countDocuments({ "history.by": id })]).then(([a, b]) => a + b),
  ]);
  return { keep, drop, inquiries, conversations, messages, offers, rentals, sales, payments, paidPlans, pendingPlans, failedPlans, invites, notifications, teamHistory, actions };
};

/**
 * The permanent-delete plan: for each kind of related record, how many there are and what happens
 * to it. Money, customer and team records are never deleted. When any of them points at this
 * account, the account is anonymised (kept as "Deleted agent") instead of removed, so nothing in
 * MongoDB is left pointing at a missing document.
 */
export const deletionPlan = async (id) => {
  const user = await loadProvider(id);
  if (!isRemoved(user)) throw new HttpError(409, "Remove this provider first. Permanent deletion is only for removed providers.");
  if (user.removal?.deletedAt) throw new HttpError(409, "This provider's details were already permanently deleted.");
  const r = await references(user);
  const kept = r.keep.length + r.inquiries + r.conversations + r.messages + r.offers + r.rentals + r.sales + r.payments + r.paidPlans + r.pendingPlans + r.teamHistory + r.actions;
  const mode = kept > 0 ? "anonymize" : "erase";
  const rows = [
    { key: "account", label: "Account and personal details", count: 1, action: mode === "erase" ? "delete" : "anonymize", detail: mode === "erase" ? "Nothing else depends on this account, so it's deleted." : "Name, email, phone, photo, logo and profile are erased. The account stays as “Deleted agent” so the history below still makes sense." },
    { key: "listingsKept", label: "Listings with customer or payment history", count: r.keep.length, action: "preserve", detail: "Stay hidden; their contact details are cleared." },
    { key: "listingsDeleted", label: "Listings nobody interacted with", count: r.drop.length, action: "delete", detail: "Deleted, and taken out of customers' saved lists." },
    { key: "inquiries", label: "Customer inquiries", count: r.inquiries, action: "preserve", detail: "Customers keep their inquiry history." },
    { key: "conversations", label: "Conversations and messages", count: r.conversations + r.messages, action: "preserve", detail: "Kept for customers; the agent shows as “Deleted agent”." },
    { key: "deals", label: "Offers, rental and purchase requests", count: r.offers + r.rentals + r.sales + r.actions, action: "preserve", detail: "Transaction history is kept." },
    { key: "payments", label: "Customer payments", count: r.payments, action: "preserve", detail: "Financial records are always kept." },
    { key: "subscriptions", label: "Paid subscriptions and payments in progress", count: r.paidPlans + r.pendingPlans, action: "preserve", detail: "Billing history is always kept." },
    { key: "failedPayments", label: "Failed subscription payments", count: r.failedPlans, action: "delete", detail: "No money changed hands." },
    { key: "invites", label: "Team invitations", count: r.invites, action: "delete", detail: "Unused links are deleted; on invites they accepted elsewhere, their name is detached." },
    { key: "team", label: "Team history", count: r.teamHistory, action: "preserve", detail: "Former staff keep a record that they worked here." },
    { key: "notifications", label: "Notifications sent to this account", count: r.notifications, action: "delete", detail: "Only this account could see them." },
  ];
  return { name: providerName(user), mode, confirmText: deleteConfirmation(user), rows, references: r };
};

// Permanently deletes a removed provider, exactly as deletionPlan() describes
export const permanentlyDeleteProvider = async (id, admin, confirm) => {
  const plan = await deletionPlan(id);
  if (normalise(confirm) !== plan.confirmText) throw new HttpError(400, `Type ${plan.confirmText} to confirm.`);
  const provider = await loadProvider(id);
  const proofOwner = await User.findById(provider._id).select("+agentApplication.proofDocuments");
  const proofFiles = proofOwner?.agentApplication?.proofDocuments || [];
  const userId = provider._id;
  const { keep, drop } = plan.references;
  const now = new Date();
  // The photos and videos of the listings being deleted, removed from Cloudinary once the delete is saved
  const dropMedia = await Property.find({ _id: { $in: drop }, owner: userId }).select("images roomTypes.images videoFile").lean();
  // Hashed before the transaction starts: transactions should stay short
  const unusablePassword = plan.mode === "erase" ? null : await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10); // nobody can sign in

  // One transaction: every delete and the account itself go together, or nothing is deleted
  const documents = await mongoose.connection.transaction(async (session) => {
    await Property.deleteMany({ _id: { $in: drop }, owner: userId }, { session });
    await User.updateMany({ savedProperties: { $in: drop } }, { $pull: { savedProperties: { $in: drop } } }, { session });
    await Property.updateMany({ _id: { $in: keep } }, { $set: { contact: { id: String(userId), name: "Deleted agent", phone: "", email: "" } } }, { session });
    await Subscription.deleteMany({ user: userId, paymentStatus: "failed" }, { session });
    await TeamInvite.deleteMany({ agency: userId }, { session });
    await TeamInvite.updateMany({ usedBy: userId }, { $set: { usedBy: null } }, { session });
    await Notification.deleteMany({ recipient: userId }, { session });
    await deleteSessions(userId, { session });
    const files = await deleteDocumentChecks({ owner: userId }, session); // their private ownership documents

    const removed = { _id: userId, "agentApplication.status": "removed" };
    const done = plan.mode === "erase"
      ? (await User.deleteOne(removed, { session })).deletedCount
      : (await User.updateOne(removed, {
        $set: {
          ...DELETED_NAME,
          email: `deleted-${userId}@deleted.nyafie.invalid`, emailKey: `deleted-${userId}@deleted.nyafie.invalid`, // frees the inbox for a new account
          phone: "",
          profileImage: "",
          password: unusablePassword,
          preferences: {},
          savedProperties: [],
          agentApplication: { status: "removed", agentType: accountTypeOf(provider) },
          "removal.deletedAt": now,
          "removal.deletedBy": admin._id,
        },
        $unset: { googleId: 1, passwordSetAt: 1 }, // their Google account is free to be used again
      }, { session })).matchedCount;
    if (!done) throw new HttpError(409, "This provider was restored or changed meanwhile. Refresh and try again.");
    return [...files, ...proofFiles];
  });
  await destroyDocuments(documents); // the files go only once the delete is saved
  await destroyListingMedia({ images: dropMedia.flatMap(listingImages), videos: dropMedia.map((listing) => listing.videoFile?.publicId) });
  return { name: plan.name, mode: plan.mode, listingsDeleted: drop.length, listingsKept: keep.length };
};
