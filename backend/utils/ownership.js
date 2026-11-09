import mongoose from "mongoose";
import Property from "../models/Property.js";
import { siteName } from "../models/Setting.js";
import { publicQuery } from "./marketplace.js";
import { canHandleTeamRecord, teamFilter, teamOf } from "./team.js";

export const same = (a, b) => Boolean(a && b) && String(a._id || a) === String(b._id || b);

/**
 * Who may act on a record tied to a listing (offer, rental, sale request):
 *  - the agent who posted the property, or for an agency: its owner, managers and the assigned agent
 *  - admins for NyaFie listings
 * Admins can also manage every record on the platform.
 */
export const ownsRecord = (record, user) =>
  record.ownerType === "admin" ? user.role === "admin" : canHandleTeamRecord(record, user);

export const canManageRecord = (record, user) => user.role === "admin" || ownsRecord(record, user);

// Records an owner's inbox may list: admins see all, agents their own (agency staff: as their role allows)
export const ownerFilter = (user) => (user.role === "admin" ? {} : { ownerType: "agent", ...teamFilter(user) });

// Listings of the user's own account or agency, which they can't make offers on or rent
export const isOwnListing = (property, user) =>
  (property.ownerType === "agent" && user.role === "agent" && same(property.owner, teamOf(user).ownerId)) || (property.ownerType === "admin" && user.role === "admin");

// A published property, or null. Owner, price and listing type always come from here, never from the request.
export const loadPublishedProperty = async (id, { session } = {}) => {
  if (!mongoose.isValidObjectId(id)) return null;
  const { query } = await publicQuery();
  const property = Property.findOne({ _id: id, ...query });
  return session ? property.session(session) : property;
};

export const ownerName = (record) =>
  record.ownerType === "admin"
    ? siteName()
    : record.owner?.firstName
      ? `${record.owner.firstName} ${record.owner.lastName}`
      : record.property?.contact?.name || "Agent";

export const formatGHS = (amount) => `GHS ${Number(amount).toLocaleString("en-GH")}`;
