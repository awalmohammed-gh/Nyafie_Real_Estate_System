import mongoose from "mongoose";

const same = (a, b) => Boolean(a && b) && String(a._id || a) === String(b._id || b);

/**
 * Agency teams. An agency owner's account owns the listings, leads and subscription; staff members
 * (user.agency) work inside it:
 *  - owner:   everything, including the subscription and the team
 *  - manager: every agency listing and lead, and assigning work (no billing or team changes)
 *  - agent:   only the listings and leads assigned to them
 * Membership is read from the signed-in user's own record, set only by accepting an invite.
 */
export const teamOf = (user) =>
  user?.role === "agent" && user.agency?.owner
    ? { ownerId: user.agency.owner._id || user.agency.owner, role: user.agency.role }
    : { ownerId: user?._id, role: "owner" };

export const isTeamMember = (user) => teamOf(user).role !== "owner";
export const canSeeAllAgencyWork = (user) => teamOf(user).role !== "agent"; // owner or manager

// MongoDB filter for agent records (property owner field = `field`) this user may see
export const teamFilter = (user, field = "owner") => {
  const { ownerId, role } = teamOf(user);
  const id = new mongoose.Types.ObjectId(String(ownerId));
  return role === "agent" ? { [field]: id, assignedTo: user._id } : { [field]: id };
};

// Whether this user may see/manage an agent record (property, inquiry, conversation, offer, rental, sale request)
export const canHandleTeamRecord = (record, user, ownerField = "owner") => {
  if (user?.role !== "agent" || user.$locals?.sessionDomain === "customer") return false;
  const { ownerId, role } = teamOf(user);
  if (!same(record[ownerField], ownerId)) return false;
  return role !== "agent" || same(record.assignedTo, user);
};
