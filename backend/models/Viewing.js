import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";
import { historySchema } from "./historySchema.js";

/**
 * requested: one side proposed `scheduledAt` and the other must answer (`proposedBy` says who proposed)
 * confirmed: both agreed. declined / cancelled: ended by a side. completed / missed: marked by the owner
 * after the time. expired: a request nobody answered before its time passed.
 */
export const VIEWING_STATUSES = ["requested", "confirmed", "declined", "cancelled", "completed", "missed", "expired"];
export const OPEN_VIEWING_STATUSES = ["requested", "confirmed"];

// A customer's appointment to see a property that is for sale or for long-term rent
const viewingSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // taken from the property
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true }, // agency staff member handling it (null: the owner)
    ownerType: { type: String, enum: ["admin", "agent"], required: true, index: true },
    scheduledAt: { type: Date, required: true, index: true }, // the agreed time, or the one waiting for an answer
    proposedBy: { type: String, enum: ["customer", "owner"], required: true },
    status: { type: String, enum: VIEWING_STATUSES, default: "requested", index: true },
    contactName: { type: String, required: true, trim: true, maxlength: 120 },
    contactPhone: { type: String, required: true, trim: true, maxlength: 30 },
    message: { type: String, default: "", maxlength: 1000 }, // the customer's note when booking
    response: { type: String, default: "", maxlength: 1000 }, // the latest note from either side
    cancelledBy: { type: String, enum: ["customer", "owner", null], default: null },
    // Set while the viewing is open, removed when it ends: the unique index allows one open viewing
    // per customer and listing, even if a request is sent twice at the same moment
    openKey: { type: String, default: undefined },
    reminderSentAt: { type: Date, default: null },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
    history: { type: [historySchema], default: [] },
  },
  schemaOptions
);
viewingSchema.index({ openKey: 1 }, { unique: true, sparse: true });

export const openKeyFor = (customer, property) => `${customer?._id || customer}:${property?._id || property}`;

// Inboxes: "my requests" (customer), the owner's list and the admin list, newest first
viewingSchema.index({ customer: 1, scheduledAt: -1 });
viewingSchema.index({ owner: 1, scheduledAt: -1 });

export default mongoose.models.Viewing || mongoose.model("Viewing", viewingSchema);
