import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/mongodb.js";
import { removeSeedViews } from "./migrations/removeSeedViews.js";

try {
  const apply = process.argv.includes("--apply");
  const report = await removeSeedViews(await connectDB(), { apply });
  console.table(report.listings.map(({ title, before, removed, after }) => ({ title, before, removed, after })));
  console.log(report.alreadyApplied
    ? "Cleanup already applied. No changes made."
    : `${apply ? "Removed" : "Would remove"} ${report.removed} seeded views; later increments are preserved.`);
  if (!apply && !report.alreadyApplied) console.log("Preview only. Apply with: npm run views:clean-seed -- --apply");
} catch (error) {
  console.error("Seed view cleanup failed:", String(error.message).replace(/mongodb(?:\+srv)?:\/\/[^\s]+/g, "[database URI redacted]"));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
