// One-off migration to real view tracking: npm run views:reset
// Earlier counts were seeded numbers or counted every page refresh, so they can't be mixed with
// deduplicated views. Sets every listing's views to 0 and clears the dedupe rows; listings keep
// their updatedAt. Run it once when deploying real view tracking.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/mongodb.js";
import Property from "../models/Property.js";
import PropertyView from "../models/PropertyView.js";

try {
  await connectDB();
  const { modifiedCount } = await Property.updateMany({ views: { $ne: 0 } }, { $set: { views: 0 } }, { timestamps: false });
  const { deletedCount } = await PropertyView.deleteMany({});
  console.log(`Reset views on ${modifiedCount} listings and cleared ${deletedCount} view records. Counts now come from real visits only.`);
} catch (error) {
  console.error("Reset failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
