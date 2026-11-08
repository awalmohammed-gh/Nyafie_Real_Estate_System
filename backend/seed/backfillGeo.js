// Nearby search index: npm run geo:backfill
// Saves now keep `geo` in step with location.latitude/longitude automatically. This catches
// listings saved before that existed: it builds `geo` from coordinates they already have, and
// removes it where coordinates are missing or invalid. It never invents coordinates, never
// changes anything else and keeps updatedAt. Safe to run more than once.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/mongodb.js";
import Property from "../models/Property.js";

const valid = {
  "location.latitude": { $type: "number", $gte: -90, $lte: 90 },
  "location.longitude": { $type: "number", $gte: -180, $lte: 180 },
};

try {
  await connectDB();
  await Property.createIndexes(); // the 2dsphere index nearby search needs
  const added = await Property.updateMany(
    { ...valid, $expr: { $or: [{ $ne: [{ $arrayElemAt: ["$geo.coordinates", 0] }, "$location.longitude"] }, { $ne: [{ $arrayElemAt: ["$geo.coordinates", 1] }, "$location.latitude"] }] } },
    [{ $set: { geo: { type: "Point", coordinates: ["$location.longitude", "$location.latitude"] } } }],
    { timestamps: false, updatePipeline: true },
  );
  const removed = await Property.updateMany({ geo: { $exists: true }, $nor: [valid] }, { $unset: { geo: 1 } }, { timestamps: false });
  const [withPin, total] = await Promise.all([Property.countDocuments({ geo: { $exists: true } }), Property.countDocuments()]);
  console.log(`Map pins indexed: ${added.modifiedCount} added or corrected, ${removed.modifiedCount} removed. ${withPin} of ${total} listings can appear in nearby search.`);
} catch (error) {
  console.error("Backfill failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
