// Database indexes: npm run indexes:sync            (builds missing indexes, lists old ones)
//                   npm run indexes:sync -- --apply (also drops the old ones it listed)
// The app builds missing indexes when it connects; this does it up front (after a deploy, or on a
// database that was copied) and reports how long each collection took. It drops only the
// single-field indexes in utils/indexMaintenance.js, and only once their replacement exists.
// Never touches documents. Safe to run more than once.
import "dotenv/config";
import { readdir } from "node:fs/promises";
import mongoose from "mongoose";
import connectDB from "../config/mongodb.js";
import { indexesToDrop } from "../utils/indexMaintenance.js";

const apply = process.argv.includes("--apply");

try {
  for (const file of await readdir(new URL("../models/", import.meta.url))) {
    if (/^[A-Z]\w*\.js$/.test(file)) await import(`../models/${file}`);
  }
  await connectDB();
  const pending = [];
  for (const model of Object.values(mongoose.models)) {
    const started = Date.now();
    await model.createIndexes();
    const names = (await model.collection.indexes()).map((index) => index.name);
    const drop = indexesToDrop(model.modelName, names);
    console.log(`${model.modelName.padEnd(20)} ${names.length} indexes, ready in ${Date.now() - started} ms${drop.length ? `; old: ${drop.join(", ")}` : ""}`);
    pending.push(...drop.map((name) => [model, name]));
  }
  if (!pending.length) console.log("No old indexes to remove.");
  else if (!apply) console.log(`${pending.length} old indexes can be removed. Run again with --apply to drop them.`);
  else {
    for (const [model, name] of pending) await model.collection.dropIndex(name);
    console.log(`Dropped ${pending.length} old indexes.`);
  }
} catch (error) {
  console.error("Index sync failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
