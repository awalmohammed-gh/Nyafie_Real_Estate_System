import mongoose from "mongoose";
import Review from "../models/Review.js";
import Property from "../models/Property.js";
import { publicQuery } from "./propertyController.js";
import { reviewerName, syncPropertyRating } from "../utils/reviews.js";
import { notifyAdmins, notifyUser } from "../utils/notify.js";
import { cleanText } from "../utils/validation.js";
import { ok, fail } from "../utils/response.js";

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  highest: { rating: -1, createdAt: -1, _id: -1 },
  lowest: { rating: 1, createdAt: -1, _id: -1 },
};
const MAX_LIMIT = 20;
const same = (a, b) => Boolean(a && b) && String(a._id || a) === String(b._id || b);
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// What anyone may see about a review: no email, phone or account id
const present = (review, viewer) => ({
  id: String(review._id),
  rating: review.rating,
  title: review.title || "",
  comment: review.comment || "",
  author: reviewerName(review.user),
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
  edited: review.updatedAt - review.createdAt > 60000,
  isMine: same(review.user, viewer),
  ...(same(review.user, viewer) ? { status: review.status } : {}),
});

/**
 * Rating and text from the request, validated on the server (the stars in the
 * browser are only a convenience). Returns { error } or the clean fields.
 */
const readReview = (body, { partial = false } = {}) => {
  const out = {};
  if (!partial || body.rating !== undefined) {
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Choose a rating from 1 to 5 stars." };
    out.rating = rating;
  }
  if (!partial || body.title !== undefined) {
    if (String(body.title || "").trim().length > 100) return { error: "Keep the review title under 100 characters." };
    out.title = cleanText(body.title, 100);
  }
  if (!partial || body.comment !== undefined) {
    if (String(body.comment || "").trim().length > 2000) return { error: "Keep the review under 2,000 characters." };
    out.comment = cleanText(body.comment, 2000);
  }
  return out;
};

// Only properties customers can actually see can be reviewed (or have their reviews listed publicly)
const loadPublicProperty = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  const { query } = await publicQuery();
  return Property.findOne({ _id: id, ...query }).select("title owner ownerType ratingAverage ratingCount");
};

const summaryOf = async (propertyId) => {
  const rows = await Review.aggregate([
    { $match: { property: new mongoose.Types.ObjectId(String(propertyId)), status: "published" } },
    { $group: { _id: "$rating", n: { $sum: 1 } } },
  ]);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rows.forEach((r) => (distribution[r._id] = r.n));
  const count = rows.reduce((s, r) => s + r.n, 0);
  const total = rows.reduce((s, r) => s + r._id * r.n, 0);
  return { average: count ? Math.round((total / count) * 100) / 100 : null, count, distribution };
};

// GET /api/properties/:id/reviews?page=1&limit=10&sort=newest|highest|lowest (public)
export const listPropertyReviews = async (req, res) => {
  const property = await loadPublicProperty(req.params.id);
  if (!property) return fail(res, 404, "Property not found.");
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.round(Number(req.query.limit) || 10)));
  const page = Math.max(1, Math.round(Number(req.query.page) || 1));
  const sort = SORTS[req.query.sort] || SORTS.newest;
  const filter = { property: property._id, status: "published" };
  // Only customers write reviews, so only a customer session has a review of its own
  const viewer = req.sessionDomain === "customer" || req.user?.role === "user" ? req.user : null;

  const [total, docs, summary, mine] = await Promise.all([
    Review.countDocuments(filter),
    Review.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).populate("user", "firstName lastName"),
    summaryOf(property._id),
    viewer ? Review.findOne({ property: property._id, user: viewer._id }).populate("user", "firstName lastName") : null,
  ]);

  ok(res, {
    items: docs.map((r) => present(r, viewer)),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    summary,
    mine: mine ? present(mine, viewer) : null, // includes a hidden review so its author knows why it isn't listed
  });
};

// POST /api/properties/:id/reviews (customers) -> creates their review, or updates the one they already wrote
export const submitReview = async (req, res) => {
  const property = await loadPublicProperty(req.params.id);
  if (!property) return fail(res, 404, "Property not found.");
  const fields = readReview(req.body);
  if (fields.error) return fail(res, 400, fields.error);

  let review = await Review.findOne({ property: property._id, user: req.user._id });
  const isNew = !review;
  if (review) {
    Object.assign(review, fields);
    await review.save();
  } else {
    try {
      review = await Review.create({ ...fields, property: property._id, user: req.user._id });
    } catch (error) {
      // Two submissions at once: the unique index keeps one review, so update that one
      if (error.code !== 11000) throw error;
      review = await Review.findOne({ property: property._id, user: req.user._id });
      Object.assign(review, fields);
      await review.save();
    }
  }
  const rating = await syncPropertyRating(property._id);

  if (isNew) {
    const payload = {
      title: "New property review",
      message: `${reviewerName(req.user)} rated "${property.title}" ${fields.rating}/5${fields.title ? `: ${fields.title}` : ""}`,
      key: `review-${review._id}`,
    };
    // Admins moderate every review; agents hear about reviews of their own listings
    notifyAdmins({ ...payload, type: "customer_review", link: "/admin/reviews" });
    if (property.ownerType === "agent") notifyUser(property.owner, { ...payload, type: "customer_review", link: `/house/${property._id}#reviews` });
  }

  await review.populate("user", "firstName lastName");
  const message = review.status === "hidden"
    ? "Your review was updated. It stays hidden from other customers while it's under moderation."
    : isNew ? "Thanks! Your review is now live." : "Your review was updated.";
  ok(res, { review: present(review, req.user), rating }, message, isNew ? 201 : 200);
};

// Loads a review only for its author (anyone else gets "not found", never a hint it exists)
const loadOwnReview = async (req, res) => {
  const review = mongoose.isValidObjectId(req.params.id) ? await Review.findById(req.params.id) : null;
  if (!review || !same(review.user, req.user)) {
    fail(res, 404, "Review not found.");
    return null;
  }
  return review;
};

// PATCH /api/reviews/:id (author only)
export const updateReview = async (req, res) => {
  const review = await loadOwnReview(req, res);
  if (!review) return;
  const fields = readReview(req.body, { partial: true });
  if (fields.error) return fail(res, 400, fields.error);
  Object.assign(review, fields);
  await review.save();
  const rating = await syncPropertyRating(review.property);
  await review.populate("user", "firstName lastName");
  ok(res, { review: present(review, req.user), rating }, "Your review was updated.");
};

// DELETE /api/reviews/:id (author only)
export const deleteReview = async (req, res) => {
  const review = await loadOwnReview(req, res);
  if (!review) return;
  await review.deleteOne();
  const rating = await syncPropertyRating(review.property);
  ok(res, { rating }, "Your review was deleted.");
};

// ---------- Admin moderation ----------

// GET /api/admin/reviews?search=&rating=&status=&page=&limit=
export const adminListReviews = async (req, res) => {
  const limit = Math.min(50, Math.max(1, Math.round(Number(req.query.limit) || 20)));
  const page = Math.max(1, Math.round(Number(req.query.page) || 1));
  const filter = {};
  if (["published", "hidden"].includes(req.query.status)) filter.status = req.query.status;
  const rating = Number(req.query.rating);
  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) filter.rating = rating;
  const search = String(req.query.search || "").trim().slice(0, 100);
  if (search) {
    const properties = await Property.find({ title: new RegExp(escapeRegex(search), "i") }).select("_id").limit(200);
    filter.property = { $in: properties.map((p) => p._id) };
  }

  const [total, docs, counts] = await Promise.all([
    Review.countDocuments(filter),
    Review.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "firstName lastName")
      .populate("property", "title ownerType")
      .populate("moderatedBy", "firstName lastName"),
    Review.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.n]));

  ok(res, {
    items: docs.map((r) => ({
      id: String(r._id),
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      status: r.status,
      author: r.user?.firstName ? `${r.user.firstName} ${r.user.lastName}` : "Deleted customer",
      authorId: r.user ? String(r.user._id) : null,
      property: r.property ? { id: String(r.property._id), title: r.property.title, ownerType: r.property.ownerType } : null,
      moderatedBy: r.moderatedBy?.firstName ? `${r.moderatedBy.firstName} ${r.moderatedBy.lastName}` : null,
      moderatedAt: r.moderatedAt || null,
      isNew: !r.adminSeenAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    counts: { all: (byStatus.published || 0) + (byStatus.hidden || 0), published: byStatus.published || 0, hidden: byStatus.hidden || 0 },
  });
};

// GET /api/admin/reviews/unseen-count -> reviews posted since an admin last opened the Reviews page
export const adminUnseenReviewCount = async (_req, res) => {
  ok(res, { count: await Review.countDocuments({ adminSeenAt: null }) });
};

// POST /api/admin/reviews/mark-seen
export const adminMarkReviewsSeen = async (_req, res) => {
  const result = await Review.updateMany({ adminSeenAt: null }, { $set: { adminSeenAt: new Date() } }, { timestamps: false });
  ok(res, { updated: result.modifiedCount });
};

// PATCH /api/admin/reviews/:id/status { status: "hidden" | "published" } -> hide or restore; content is never changed
export const adminSetReviewStatus = async (req, res) => {
  const { status } = req.body;
  if (!["published", "hidden"].includes(status)) return fail(res, 400, "Status must be published or hidden.");
  const review = mongoose.isValidObjectId(req.params.id) ? await Review.findById(req.params.id) : null;
  if (!review) return fail(res, 404, "Review not found.");
  if (review.status !== status) {
    // Moderation isn't an edit by the customer, so the review's updatedAt ("edited") stays as it was
    await Review.updateOne({ _id: review._id }, { $set: { status, moderatedBy: req.user._id, moderatedAt: new Date(), adminSeenAt: review.adminSeenAt || new Date() } }, { timestamps: false });
    await syncPropertyRating(review.property);
  }
  ok(res, { id: String(review._id), status }, status === "hidden" ? "Review hidden from the property page." : "Review restored.");
};
