import client from "./client";

// Property ratings and reviews. The author is always the signed-in customer (set by the server).

// { items, page, pages, total, summary: { average, count, distribution }, mine }
export const getPropertyReviews = async (propertyId, { page = 1, limit = 10, sort = "newest" } = {}) =>
  (await client.get(`/properties/${propertyId}/reviews`, { params: { page, limit, sort } })).data;

// Creates the customer's review, or updates it when they already reviewed this property
export const submitReview = async (propertyId, { rating, title, comment }) => {
  const res = await client.post(`/properties/${propertyId}/reviews`, { rating, title, comment });
  return { ...res.data, message: res.message };
};
export const updateReview = async (reviewId, changes) => {
  const res = await client.patch(`/reviews/${reviewId}`, changes);
  return { ...res.data, message: res.message };
};
export const deleteReview = async (reviewId) => {
  const res = await client.delete(`/reviews/${reviewId}`);
  return { ...res.data, message: res.message };
};

// ---------- Admin moderation
export const getAdminReviews = async (params = {}) => (await client.get("/admin/reviews", { params })).data;
export const getUnseenReviewCount = async () => (await client.get("/admin/reviews/unseen-count")).data.count;
export const markReviewsSeen = () => client.post("/admin/reviews/mark-seen");
export const setReviewStatus = async (reviewId, status) => {
  const res = await client.patch(`/admin/reviews/${reviewId}/status`, { status });
  return { ...res.data, message: res.message };
};
