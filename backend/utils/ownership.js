import mongoose from "mongoose";
import Property from "../models/Property.js";
import { siteName } from "../models/Setting.js";

export const same = (a, b) => Boolean(a && b) && String(a._id || a) === String(b._id || b);

/**
 * Who may act on a record tied to a listing (offer, rental):
 *  - the agent who posted the property
 *  - admins for HomeBase listings
 * Admins can also manage every record on the platform.
 */
export const ownsRecord = (record, user) =>
  record.ownerType === "admin" ? user.role === "admin" : user.role === "agent" && same(record.owner, user);

export const canManageRecord = (record, user) => user.role === "admin" || ownsRecord(record, user);

// Records an owner's inbox may list: admins see all, agents only their own listings
export const ownerFilter = (user) => (user.role === "admin" ? {} : { ownerType: "agent", owner: user._id });

export const isOwnListing = (property, user) => same(property.owner, user) || (property.ownerType === "admin" && user.role === "admin");

// A published property, or null. Owner, price and listing type always come from here, never from the request.
export const loadPublishedProperty = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return Property.findOne({ _id: id, status: "published" });
};

export const ownerName = (record) =>
  record.ownerType === "admin"
    ? siteName()
    : record.owner?.firstName
      ? `${record.owner.firstName} ${record.owner.lastName}`
      : record.property?.contact?.name || "Agent";

export const formatGHS = (amount) => `GHS ${Number(amount).toLocaleString("en-GH")}`;
