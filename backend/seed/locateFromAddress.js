// Put listings without a map pin on the map from their address: npm run geo:locate [-- --apply]
// Without --apply it only prints what it would do. It never touches a listing that already has a
// pin, marks the new pins as approximate (pinSource "address"), keeps updatedAt, and writes the
// geo point used by nearby search. Agents and admins can drag any pin to the exact building later.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/mongodb.js";
import Property, { geoPoint } from "../models/Property.js";
import { locateFromAddress } from "../utils/autoLocate.js";

const apply = process.argv.includes("--apply");
const noPin = { $or: [{ "location.latitude": { $not: { $type: "number" } } }, { "location.longitude": { $not: { $type: "number" } } }] };

try {
  await connectDB();
  const listings = await Property.find(noPin).select("title status location").lean();
  console.log(`${listings.length} listing(s) without a map pin.${apply ? "" : " Preview only: add --apply to save."}\n`);
  let placed = 0;
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));
  // The free geocoder is shared: about one lookup a second, and a busy answer is retried, not "not found"
  const locate = async (location) => {
    for (let attempt = 1; ; attempt++) {
      try { return await locateFromAddress(location, { throwIfUnavailable: true }); }
      catch (error) {
        if (attempt === 4) throw new Error(`the geocoder is unavailable (${error.reason || error.message}); try again later`);
        await pause(attempt * 3000);
      }
    }
  };
  for (const listing of listings) {
    await pause(1100);
    const found = await locate(listing.location);
    const where = [listing.location?.neighbourhood, listing.location?.city].filter(Boolean).join(", ") || "(no address)";
    if (!found) { console.log(`  not found   ${listing.title}  [${where}]`); continue; }
    console.log(`  ${apply ? "placed   " : "would place"}  ${listing.title}  [${where}] -> ${found.label} (${found.latitude.toFixed(4)}, ${found.longitude.toFixed(4)})`);
    if (!apply) continue;
    const location = { ...listing.location, latitude: found.latitude, longitude: found.longitude };
    // Only if it still has no pin (nobody placed one while this ran)
    const { modifiedCount } = await Property.updateOne({ _id: listing._id, ...noPin }, { $set: { "location.latitude": found.latitude, "location.longitude": found.longitude, "location.pinSource": "address", geo: geoPoint(location) } }, { timestamps: false });
    placed += modifiedCount;
  }
  console.log(apply ? `\nPlaced ${placed} listing(s) on the map.` : "\nNothing was saved.");
} catch (error) {
  console.error("Locating listings failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
