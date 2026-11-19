import mongoose from "mongoose";

// Counted views per listing per day (UTC, which is Ghana time), for the owner's insights chart.
// The all-time total stays on Property.views; these rows expire after about a year.
const schema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    day: { type: Date, required: true }, // midnight UTC
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);
schema.index({ property: 1, day: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VIEW_DAYS_KEPT = 400;
export const startOfDay = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

// Adds one view to today's row (created on the first view of the day)
export const countViewToday = (propertyId, now = new Date()) => {
  const day = startOfDay(now);
  return PropertyViewDay.updateOne(
    { property: propertyId, day },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(day.getTime() + VIEW_DAYS_KEPT * 24 * 60 * 60 * 1000) } },
    { upsert: true },
  );
};

const PropertyViewDay = mongoose.models.PropertyViewDay || mongoose.model("PropertyViewDay", schema);
export default PropertyViewDay;
