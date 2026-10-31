// Historical fixture values, used only to subtract the demo baseline from existing data.
// New listings already start at zero; never import these values into the regular seed.
const legacyViews = [
  ["The Coral Cubist", "/properties/house1.jpg", 320],
  ["The Lumina Cantilever", "/properties/house2.jpg", 1240],
  ["The Obsidian Pavilion", "/properties/house3.jpg", 1560],
  ["The Glass Atrium", "/properties/house4.jpg", 980],
  ["The Wrap-Around Terrace", "/properties/house5.jpg", 720],
  ["The Terraced Stone Villa", "/properties/house6.jpg", 890],
  ["The Golden Sand Estate", "/properties/house7_1.jpg", 540],
  ["The Azure Tiled Boutique", "/properties/house_8.jpg", 3100],
  ["The Balcony Block", "/properties/house9.jpg", 1850],
  ["The Geometric Mono-Block", "/properties/house10.jpg", 430],
  ["The Veranda Crest", "/properties/house11.jpg", 2100],
  ["The Slate & Ochre Duplex", "/properties/house12.png", 650],
];

const MIGRATION = "remove-seeded-property-views-v1";

const inspect = async (db, session) => {
  const options = session ? { session } : {};
  const previous = await db.collection("dataMigrations").findOne({ _id: MIGRATION }, options);
  if (previous) return { alreadyApplied: true, removed: previous.removed, listings: previous.listings };

  const listings = [];
  for (const [title, image, baseline] of legacyViews) {
    const matches = await db.collection("properties").find(
      { ownerType: "admin", title, images: image },
      { ...options, projection: { views: 1, title: 1 } },
    ).toArray();
    for (const property of matches) {
      const before = property.views ?? 0;
      // A reset/clean installation may already have removed the seed. Leave it alone.
      const removed = Number.isSafeInteger(before) && before >= baseline ? baseline : 0;
      listings.push({ id: property._id, title, before, removed, after: before - removed });
    }
  }
  return { alreadyApplied: false, removed: listings.reduce((sum, p) => sum + p.removed, 0), listings };
};

export const removeSeedViews = async (connection, { apply = false } = {}) => {
  if (!apply) return inspect(connection.db);
  const session = await connection.startSession();
  try {
    // Keep the correction and its receipt together. Concurrent view increments cause a retry,
    // so no live visits are lost, and a crash/rerun cannot subtract the baseline twice.
    return await session.withTransaction(async () => {
      const report = await inspect(connection.db, session);
      if (report.alreadyApplied) return report;
      for (const property of report.listings.filter((p) => p.removed)) {
        await connection.db.collection("properties").updateOne(
          { _id: property.id }, { $inc: { views: -property.removed } }, { session },
        );
      }
      await connection.db.collection("dataMigrations").insertOne(
        { _id: MIGRATION, completedAt: new Date(), removed: report.removed, listings: report.listings },
        { session },
      );
      return report;
    });
  } finally {
    await session.endSession();
  }
};
