import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import { createApp } from "../app.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

// Places as people type them: one neighbourhood spelled three ways, one of them saved before place keys existed
test("every spelling of a place counts as one place in search and filters", { skip: process.env.RUN_PLACES_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  await isolatedMongo(t); // a temporary database: nothing here touches the application's data
  await Setting.create({ key: "platform" });
  const listing = (title, neighbourhood, extra = {}) => ({
    title, description: "A home", price: 4000, pricePeriod: "month", propertyType: "Apartment", listingType: "Rent",
    ownerType: "admin", owner: new mongoose.Types.ObjectId(), status: "published", images: ["/home.jpg"],
    location: { neighbourhood, city: "Accra", region: "Greater Accra", address: "1 Road" }, ...extra,
  });
  // Saved through the model: keys are set automatically
  const first = await Property.create(listing("First", "East Legon"));
  const second = await Property.create(listing("Second", "East-Legon"));
  assert.equal(first.location.areaKey, "east-legon");
  assert.equal(second.location.areaKey, "east-legon");
  assert.equal(second.location.cityKey, "accra");
  // An older listing without keys (written directly, as before keys existed)
  await Property.collection.insertOne({ ...listing("Older", "east legon"), createdAt: new Date(), updatedAt: new Date() });
  await Property.create(listing("Elsewhere", "Osu"));
  // Editing the place updates its key
  second.location.neighbourhood = "Osu";
  await second.save();
  assert.equal(second.location.areaKey, "osu");
  second.location.neighbourhood = "East-Legon";
  await second.save();

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const get = async (path) => (await (await fetch(`http://127.0.0.1:${server.address().port}/api${path}`)).json()).data;

  // Any spelling finds all three listings in that place, and none elsewhere
  for (const area of ["East Legon", "east-legon", "EAST LEGON"]) {
    const found = await get(`/properties?listingType=Rent&area=${encodeURIComponent(area)}`);
    const titles = (found.items || found.properties || found).map((item) => item.title).sort();
    assert.deepEqual(titles, ["First", "Older", "Second"], area);
  }
  // The filter list shows the place once, with all its listings counted
  const facets = await get("/properties/facets?listingType=Rent");
  const legon = facets.areas.filter((area) => area.name.toLowerCase().replace(/[^a-z]/g, "") === "eastlegon");
  assert.equal(legon.length, 1, "one option, not one per spelling");
  assert.equal(legon[0].count, 3);
  assert.equal(facets.areas.find((area) => area.name === "Osu").count, 1);
  assert.equal(facets.cities.length, 1);
  assert.equal(facets.cities[0].count, 4);
});
