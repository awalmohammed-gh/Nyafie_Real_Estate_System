import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { isolatedMongo } from "./support/isolatedMongo.js";
import { removeSeedViews } from "../seed/migrations/removeSeedViews.js";

test("seed view cleanup preserves visits, unrelated listings, and timestamps atomically", {
  skip: process.env.RUN_VIEW_MIGRATION_INTEGRATION !== "1",
}, async (t) => {
  await isolatedMongo(t);
  const connection = mongoose.connection;
  const properties = connection.db.collection("properties");
  const receipts = connection.db.collection("dataMigrations");
  await receipts.createIndex({ completedAt: 1 }); // create before starting transactions
  const updatedAt = new Date("2026-01-01");
  const listing = (extra = {}) => ({ title: "The Glass Atrium", images: ["/properties/house4.jpg"], ownerType: "admin", views: 981, updatedAt, ...extra });
  await properties.insertMany([
    listing(),
    listing({ title: "The Lumina Cantilever", images: ["/properties/house2.jpg"], views: 1242 }),
    listing({ title: "The Coral Cubist", images: ["/properties/house1.jpg"], views: 5 }), // already reset
    listing({ ownerType: "agent" }),
    listing({ images: ["/uploads/new-house.jpg"] }),
  ]);
  const before = await properties.find().toArray();
  const windows = connection.db.collection("propertyviews");
  await windows.insertOne({ property: before[0]._id, viewer: "existing-view-window" });

  const preview = await removeSeedViews(connection);
  assert.equal(preview.removed, 2220);
  assert.deepEqual(await properties.find().toArray(), before);
  assert.equal(await receipts.countDocuments(), 0);

  // Simulate a failure after the first correction: both the first write and receipt must roll back.
  let writes = 0;
  const failingConnection = {
    startSession: () => connection.startSession(),
    db: { collection: (name) => name !== "properties" ? connection.db.collection(name) : {
      find: (...args) => properties.find(...args),
      updateOne: (...args) => {
        if (++writes === 2) throw new Error("interrupted cleanup");
        return properties.updateOne(...args);
      },
    } },
  };
  await assert.rejects(removeSeedViews(failingConnection, { apply: true }), /interrupted cleanup/);
  assert.deepEqual(await properties.find().toArray(), before);
  assert.equal(await receipts.countDocuments(), 0);

  // A live view arriving after the transaction's read must survive its conflict/retry.
  let incremented = false;
  const concurrentConnection = {
    startSession: () => connection.startSession(),
    db: { collection: (name) => name !== "properties" ? connection.db.collection(name) : {
      find: (...args) => properties.find(...args),
      updateOne: async (...args) => {
        if (!incremented) {
          incremented = true;
          await properties.updateOne({ _id: before[0]._id }, { $inc: { views: 1 } });
        }
        return properties.updateOne(...args);
      },
    } },
  };
  const applied = await removeSeedViews(concurrentConnection, { apply: true });
  assert.equal(applied.removed, 2220);
  const after = await properties.find().toArray();
  assert.deepEqual(after.map((p) => p.views), [2, 2, 5, 981, 981]);
  assert.ok(after.every((p) => p.updatedAt.getTime() === updatedAt.getTime()));
  assert.equal(await windows.countDocuments(), 1); // deduplication is preserved
  assert.equal(await receipts.countDocuments(), 1);

  // Even once genuine views exceed the old baseline, a rerun must never subtract it again.
  await properties.updateOne({ _id: before[0]._id }, { $inc: { views: 1000 } });
  assert.equal((await removeSeedViews(connection, { apply: true })).alreadyApplied, true);
  assert.equal((await properties.findOne({ _id: before[0]._id })).views, 1002);
});
