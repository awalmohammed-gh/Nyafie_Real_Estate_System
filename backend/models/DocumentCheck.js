import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

/**
 * The ownership documents an owner submitted for one sale listing, and NyaFie's check of them.
 * Files live in Cloudinary as PRIVATE assets: only `publicId` is stored, never a delivery URL
 * (the URL returned at upload carries a permanent signature). Each view creates a link that
 * expires (utils/propertyDocuments.js). Nothing here is ever sent with the public listing.
 *
 * draft: the owner is adding documents. pending: submitted, waiting for an admin.
 * verified: checked; the listing shows the badge. rejected: the owner must fix something (note).
 */
export const DOCUMENT_CHECK_STATUSES = [
  "draft",
  "pending",
  "verified",
  "rejected",
];

const documentSchema = new mongoose.Schema(
  {
    kind: { type: String, required: true },
    name: { type: String, required: true, maxlength: 120 }, // the file name the owner chose, for reference
    publicId: { type: String, required: true },
    format: { type: String, required: true }, // pdf | jpg | png | webp
    bytes: { type: Number, default: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const documentCheckSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      unique: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: { type: String, enum: DOCUMENT_CHECK_STATUSES, default: "draft" },
    documents: { type: [documentSchema], default: [] },
    note: { type: String, default: "", maxlength: 1000 }, // the admin's message to the owner (e.g. what's missing)
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  schemaOptions,
);

documentCheckSchema.index({ status: 1, submittedAt: 1 }); // admin queue: oldest submission first

export default mongoose.models.DocumentCheck ||
  mongoose.model("DocumentCheck", documentCheckSchema);
