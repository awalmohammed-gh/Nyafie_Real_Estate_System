// Place keys for area search and location pages: npm run places:backfill
// Saves now set location.areaKey / cityKey automatically (models/Property.js). This gives the same keys
// to listings saved before that existed, so every listing is found through the place-key indexes and
// its spellings ("East Legon", "East-Legon") count as one place. It changes nothing else, keeps
// updatedAt, works in batches (fine for any number of listings) and is safe to run more than once.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/mongodb.js";
import Property from "../models/Property.js";
import { placeSlug } from "../utils/seo.js";

const BATCH = 500;

try {
  await connectDB();
  await Property.createIndexes(); // the place-key indexes the search and location pages use
  let checked = 0;
  let updated = 0;
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const result = await Property.bulkWrite(batch, { ordered: false, timestamps: false });
    updated += result.modifiedCount;
    batch = [];
  };
  const cursor = Property.find({}, { "location.neighbourhood": 1, "location.city": 1, "location.areaKey": 1, "location.cityKey": 1 }).lean().cursor();
  for await (const listing of cursor) {
    checked += 1;
    const areaKey = placeSlug(listing.location?.neighbourhood) || undefined;
    const cityKey = placeSlug(listing.location?.city) || undefined;
    if (listing.location?.areaKey === areaKey && listing.location?.cityKey === cityKey) continue;
    const $set = {};
    const $unset = {};
    if (areaKey) $set["location.areaKey"] = areaKey; else $unset["location.areaKey"] = 1;
    if (cityKey) $set["location.cityKey"] = cityKey; else $unset["location.cityKey"] = 1;
    batch.push({ updateOne: { filter: { _id: listing._id }, update: { ...(Object.keys($set).length && { $set }), ...(Object.keys($unset).length && { $unset }) }, timestamps: false } });
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  console.log(`Place keys: ${updated} of ${checked} listings updated. Area search and location pages now use the place-key indexes for all of them.`);
} catch (error) {
  console.error("Backfill failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
