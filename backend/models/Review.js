import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

export const REVIEW_STATUSES = ["published", "hidden"];

// A customer's star rating (and optional written review) of one property.
// One per customer per property: rating again updates the same document.
const reviewSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5, validate: { validator: Number.isInteger, message: "Rating must be a whole number." } },
    title: { type: String, default: "", trim: true, maxlength: 100 },
    comment: { type: String, default: "", trim: true, maxlength: 2000 },
    // hidden: removed from public view by an admin (content is never edited by staff)
    status: { type: String, enum: REVIEW_STATUSES, default: "published", index: true },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    moderatedAt: { type: Date },
    // Set once an admin has opened the Reviews page after this review was posted (drives the sidebar badge)
    adminSeenAt: { type: Date, default: null },
  },
  schemaOptions
);

reviewSchema.index({ property: 1, user: 1 }, { unique: true });
reviewSchema.index({ property: 1, status: 1, createdAt: -1 });

export default mongoose.models.Review || mongoose.model("Review", reviewSchema);
