import mongoose from "mongoose";

// Duplicate detection for property views (utils/propertyViews.js); the total lives on Property.views.
// viewer is a keyed hash (never a raw IP or user id). Rows expire shortly after their window ends.
const schema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    viewer: { type: String, required: true },
    viewedAt: { type: Date, required: true }, // start of the current window
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);
schema.index({ property: 1, viewer: 1 }, { unique: true }); // one row per viewer per listing; makes the check a single index lookup
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.PropertyView || mongoose.model("PropertyView", schema);
