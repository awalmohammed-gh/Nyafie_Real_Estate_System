import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import { createApp } from "../app.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("the home page's rows, counts and short stays come from what is really listed", { skip: process.env.RUN_HOME_PAGE_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  await isolatedMongo(t);
  await Setting.create({ key: "platform" });
  const owner = new mongoose.Types.ObjectId();
  const days = (n) => new Date(Date.now() - n * 86400000);
  const add = (title, extra = {}) => Property.create({
    title, description: "A home in Accra with room to live.", price: 4000, pricePeriod: "month", propertyType: "Apartment", listingType: "Rent",
    ownerType: "admin", owner, status: "published", images: ["/home.jpg"], location: { neighbourhood: "Osu", city: "Accra", region: "Greater Accra", address: "1 Road" }, ...extra,
  });
  const villa = await add("Nightly villa", { propertyType: "Villa", pricePeriod: "night", createdAt: days(1) });
  const hotel = await add("Hotel apartment", { propertyType: "Hotel-Apartment", createdAt: days(2) });
  const flat = await add("Monthly flat", { createdAt: days(3) });
  const house = await add("House for sale", { listingType: "Sale", pricePeriod: "total", propertyType: "Townhouse", isFeatured: true, createdAt: days(30) });
  await add("Hotel for sale", { listingType: "Sale", pricePeriod: "total", propertyType: "Hotel-Apartment", createdAt: days(60) });
  await add("Already rented", { availability: "Rented", createdAt: days(0.5) });
  await add("Draft", { status: "draft" });
  await add("Awaiting confirmation", { staleSince: days(1) });
  for (let i = 0; i < 10; i++) await add(`Old sale ${i}`, { listingType: "Sale", pricePeriod: "total", createdAt: days(40 + i) });

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const get = async (path) => (await (await fetch(`http://127.0.0.1:${server.address().port}/api${path}`)).json()).data;

  const home = await get("/properties/home");
  const ids = (...docs) => docs.map((doc) => doc.id);
  assert.deepEqual(home.rows.stays, ids(villa, hotel), "any home rented by the night, and hotels");
  assert.deepEqual(home.rows.rent, ids(flat), "homes to live in");
  assert.deepEqual(home.rows.featured, ids(house));
  assert.deepEqual(home.rows.latest.slice(0, 3), ids(villa, hotel, flat), "newest first, only available ones");
  assert.equal(home.rows.sale.length, 8);
  assert.equal(new Set(home.items.map((item) => item.id)).size, home.items.length, "each home is sent once");
  assert.ok(Object.values(home.rows).flat().every((id) => home.items.some((item) => item.id === id)));
  assert.ok(home.items.every((item) => item.status === "published" && item.title !== "Awaiting confirmation"));
  assert.deepEqual([home.facets.total, home.facets.sale, home.facets.rent, home.facets.stays, home.newThisWeek], [16, 12, 4, 2, 4]);

  // The links the page offers show the same homes
  const list = async (query) => (await get(`/properties?page=1&limit=48&${query}`)).items.map((item) => item.title).sort();
  assert.deepEqual(await list("stay=true"), ["Hotel apartment", "Nightly villa"]);
  assert.deepEqual(await list("listingType=Rent&stay=false"), ["Already rented", "Monthly flat"]);
  assert.deepEqual((await get("/properties/facets?stay=true")).types.map((type) => type.value).sort(), ["Hotel-Apartment", "Villa"]);
  assert.deepEqual([home.facets.rent, home.facets.rentHomes], [4, 2], "rent without short stays");
  const rent = await get("/properties/facets?listingType=Rent&stay=false");
  assert.deepEqual([rent.total, rent.rentHomes, rent.stays, rent.types.map((type) => type.value)], [2, 2, 0, ["Apartment"]]);
  assert.deepEqual([rent.priceRange.Rent.minPrice, rent.priceRange.Rent.maxPrice], [4000, 4000]);
  assert.equal((await get("/properties/facets?listingType=Sale")).total, 12, "facets for one listing type are unchanged");
});
