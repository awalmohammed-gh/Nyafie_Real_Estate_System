import mongoose from "mongoose";
import Review from "../models/Review.js";
import Property from "../models/Property.js";

/**
 * Recalculates a property's ratingAverage / ratingCount from its published reviews.
 * Called after every create, edit, delete, hide and restore, so listings, cards and
 * "Top rated" sorting can read the stored values without aggregating.
 */
// Inside a transaction, pass its `session`: the new rating then counts the transaction's own changes.
export const syncPropertyRating = async (propertyId, session = null) => {
  const id = new mongoose.Types.ObjectId(String(propertyId));
  const [stats] = await Review.aggregate([
    { $match: { property: id, status: "published" } },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]).session(session);
  const ratingCount = stats?.count || 0;
  const ratingAverage = ratingCount ? Math.round(stats.average * 100) / 100 : null;
  // A rating change isn't an edit of the listing, so updatedAt stays as it was
  await Property.updateOne({ _id: id }, { $set: { ratingAverage, ratingCount } }, { timestamps: false, session });
  return { ratingAverage, ratingCount };
};

// Public name for a reviewer: first name and last initial, never contact details
export const reviewerName = (user) => {
  if (!user?.firstName) return "Former customer";
  const initial = user.lastName ? ` ${user.lastName.trim().charAt(0).toUpperCase()}.` : "";
  return `${user.firstName.trim()}${initial}`;
};
