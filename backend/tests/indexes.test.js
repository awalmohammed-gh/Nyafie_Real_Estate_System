import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import mongoose from "mongoose";
import { REPLACED_INDEXES, indexName, indexesToDrop } from "../utils/indexMaintenance.js";

for (const file of await readdir(new URL("../models/", import.meta.url))) {
  if (/^[A-Z]\w*\.js$/.test(file)) await import(`../models/${file}`);
}
const schemaIndexNames = (model) => model.schema.indexes().map(([keys, options]) => indexName(keys, options));

test("each replaced index names a compound index the schema defines, and the old one is gone", () => {
  for (const [modelName, replaced] of Object.entries(REPLACED_INDEXES)) {
    const model = mongoose.models[modelName];
    assert.ok(model, `${modelName} is a model`);
    const names = schemaIndexNames(model);
    for (const [old, replacement] of Object.entries(replaced)) {
      assert.ok(names.includes(replacement), `${modelName}: ${replacement} is defined`);
      assert.ok(!names.includes(old), `${modelName}: ${old} is no longer defined`);
      assert.ok(replacement.startsWith(`${old.replace(/_-?1$/, "")}_`), `${modelName}: ${replacement} starts with the field of ${old}`);
    }
  }
});

test("no model defines the same index twice", () => {
  for (const model of Object.values(mongoose.models)) {
    const definitions = model.schema.indexes().map(([keys, options]) => JSON.stringify([keys, options]));
    assert.equal(new Set(definitions).size, definitions.length, `${model.modelName} has a duplicate index definition`);
  }
});

test("old indexes are dropped only once their replacement exists", () => {
  assert.deepEqual(indexesToDrop("Offer", ["_id_", "customer_1", "owner_1"]), [], "replacements not built yet: keep both");
  assert.deepEqual(indexesToDrop("Offer", ["_id_", "customer_1", "customer_1_createdAt_-1", "owner_1"]), ["customer_1"]);
  assert.deepEqual(indexesToDrop("Offer", ["_id_", "status_1"]), [], "unlisted indexes are never dropped");
  assert.deepEqual(indexesToDrop("Unknown", ["customer_1", "customer_1_createdAt_-1"]), []);
});
