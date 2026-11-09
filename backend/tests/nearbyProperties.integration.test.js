import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { createApp } from "../app.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import User from "../models/User.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

const run = promisify(execFile);
// East Legon, Accra. 0.009 degrees of latitude is about 1 km.
const CENTER = { latitude: 5.6355, longitude: -0.1617 };
const north = (km) => ({ latitude: Math.round((CENTER.latitude + km / 111.195) * 1e6) / 1e6, longitude: CENTER.longitude });
const haversine = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180, R = 6378100;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

test("nearby search uses real coordinates, public visibility rules and every filter together", { skip: process.env.RUN_NEARBY_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  const uri = await isolatedMongo(t);
  await Setting.create({ key: "platform", agent: { requireSubscription: false } });
  const admin = await User.create({ emailVerifiedAt: new Date(), firstName: "Nyafie", lastName: "Admin", email: "admin@nearby.test", password: "test-password", role: "admin" });
  const visibleAgent = await User.create({ emailVerifiedAt: new Date(), firstName: "Ama", lastName: "Owusu", email: "ama@nearby.test", phone: "0241111111", password: "test-password", role: "agent", agentApplication: { status: "approved" } });
  const pendingAgent = await User.create({ emailVerifiedAt: new Date(), firstName: "Kofi", lastName: "Boateng", email: "kofi@nearby.test", password: "test-password", role: "agent", agentApplication: { status: "pending" } });

  const base = { description: "A listing used to check location-based discovery in an isolated database.", area: 120, images: ["https://res.cloudinary.com/demo/image/upload/house.jpg"], contact: { name: "Desk", phone: "0240000000", email: "desk@nearby.test" } };
  const place = (km, extra = {}) => ({ ...base, location: { address: "1 Test Street", neighbourhood: "East Legon", city: "Accra", region: "Greater Accra", ...north(km) }, owner: admin._id, ownerType: "admin", status: "published", ...extra });
  const listings = {
    rentNear: place(0.4, { title: "Rent near", listingType: "Rent", pricePeriod: "month", propertyType: "Apartment", price: 3000, bedrooms: 2, bathrooms: 1 }),
    agentHome: place(1.5, { title: "Agent home", listingType: "Sale", propertyType: "Townhouse", price: 650000, bedrooms: 3, owner: visibleAgent._id, ownerType: "agent", contact: { name: "Ama Owusu", phone: "0241111111", email: "ama@nearby.test" } }),
    saleHouse: place(2, { title: "Sale house", listingType: "Sale", propertyType: "Villa", price: 900000, bedrooms: 3, bathrooms: 3 }),
    furnished: place(4, { title: "Furnished flat", listingType: "Rent", pricePeriod: "month", propertyType: "Apartment", price: 6000, bedrooms: 3, amenities: ["Parking", "Furnished"] }),
    rentFar: place(8, { title: "Rent far", listingType: "Rent", pricePeriod: "month", propertyType: "Apartment", price: 2500, bedrooms: 2 }),
    landAway: place(30, { title: "Land away", listingType: "Sale", propertyType: "Single", price: 120000 }),
    // Never in public nearby results
    draft: place(1, { title: "Draft", listingType: "Rent", propertyType: "Apartment", price: 1000, status: "draft" }),
    sold: place(1, { title: "Sold", listingType: "Sale", propertyType: "Villa", price: 1000, availability: "Sold" }),
    rented: place(1, { title: "Rented", listingType: "Rent", propertyType: "Apartment", price: 1000, availability: "Rented" }),
    suspended: place(1, { title: "Suspended", listingType: "Sale", propertyType: "Villa", price: 1000, status: "suspended" }),
    hiddenAgent: place(1, { title: "Hidden agent", listingType: "Sale", propertyType: "Villa", price: 1000, owner: pendingAgent._id, ownerType: "agent" }),
  };
  const ids = {};
  for (const [key, doc] of Object.entries(listings)) ids[key] = String((await Property.create(doc))._id);
  // Published without a map pin: public in normal search, never placed on the map
  const noPin = await Property.create({ ...place(0), title: "No pin", listingType: "Rent", propertyType: "Apartment", price: 1500, location: { address: "2 Test Street", neighbourhood: "East Legon", city: "Accra" } });
  assert.equal(noPin.geo, undefined, "no coordinates means no geo point, not a guessed one");
  // Saved before geo existed: coordinates but no geo point, until the backfill runs
  const legacy = await mongoose.connection.collection("properties").insertOne({ ...place(3), title: "Legacy pin", listingType: "Sale", propertyType: "Villa", price: 400000, bedrooms: 4, bathrooms: 2, availability: "Available", amenities: [], createdAt: new Date(), updatedAt: new Date(2020, 0, 1) });
  const staleGeo = await mongoose.connection.collection("properties").insertOne({ ...place(0), title: "Stale geo", listingType: "Rent", propertyType: "Apartment", price: 900, availability: "Available", location: { address: "3", neighbourhood: "East Legon", city: "Accra", latitude: null, longitude: null }, geo: { type: "Point", coordinates: [CENTER.longitude, CENTER.latitude] }, createdAt: new Date(), updatedAt: new Date() });

  await t.test("the backfill indexes existing coordinates, removes stale points and keeps updatedAt", async () => {
    const { stdout } = await run(process.execPath, ["seed/backfillGeo.js"], { env: { ...process.env, MONGODB_URI: uri, MONGODB_DB: "" }, cwd: process.cwd() });
    assert.match(stdout, /1 added or corrected, 1 removed/);
    const [fixed, cleared] = await Promise.all([Property.findById(legacy.insertedId).lean(), Property.findById(staleGeo.insertedId).lean()]);
    assert.deepEqual(fixed.geo, { type: "Point", coordinates: [north(3).longitude, north(3).latitude] });
    assert.equal(fixed.updatedAt.getFullYear(), 2020);
    assert.equal(cleared.geo, undefined);
    const again = await run(process.execPath, ["seed/backfillGeo.js"], { env: { ...process.env, MONGODB_URI: uri, MONGODB_DB: "" }, cwd: process.cwd() });
    assert.match(again.stdout, /0 added or corrected, 0 removed/, "safe to run twice");
    assert.ok((await Property.listIndexes()).some((index) => index.key.geo === "2dsphere"));
  });
  ids.legacy = String(legacy.insertedId);

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const api = async (params) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/properties/nearby?${new URLSearchParams({ ...CENTER, ...params })}`);
    return { status: response.status, ...(await response.json()) };
  };
  const titles = (body) => body.data.items.map((item) => item.title);

  await t.test("the default 5 km search returns only open, visible, pinned listings, nearest first", async () => {
    const body = await api({});
    assert.equal(body.status, 200);
    assert.deepEqual(titles(body), ["Rent near", "Agent home", "Sale house", "Legacy pin", "Furnished flat"]);
    assert.equal(body.data.total, 5);
    assert.equal(body.data.radius, 5);
    for (const item of body.data.items) {
      const expected = haversine(CENTER, { latitude: item.location.latitude, longitude: item.location.longitude });
      assert.ok(Math.abs(item.distance - expected) <= 10, `${item.title}: ${item.distance} m vs ${Math.round(expected)} m`);
      assert.ok(item.distance <= 5000);
      assert.equal(item.geo, undefined, "the derived point stays internal");
    }
    assert.ok(Math.abs(body.data.items[0].distance - 400) <= 10);
  });

  await t.test("changing the radius changes the results", async () => {
    assert.deepEqual(titles(await api({ radius: 1 })), ["Rent near"]);
    assert.equal((await api({ radius: 10 })).data.total, 6);
    assert.deepEqual(titles(await api({ radius: 50 })).at(-1), "Land away");
    assert.equal((await api({ radius: 50 })).data.total, 7);
  });

  await t.test("listing type, property type, price, bedrooms and amenities all apply together", async () => {
    assert.deepEqual(titles(await api({ radius: 10, listingType: "Rent" })), ["Rent near", "Furnished flat", "Rent far"]);
    assert.deepEqual(titles(await api({ radius: 10, listingType: "Sale" })), ["Agent home", "Sale house", "Legacy pin"]);
    assert.deepEqual(titles(await api({ radius: 10, listingType: "Rent", type: "Apartment", maxPrice: 5000, bedrooms: 2 })), ["Rent near", "Rent far"]);
    assert.deepEqual(titles(await api({ radius: 10, minPrice: 500000 })), ["Agent home", "Sale house"]);
    assert.deepEqual(titles(await api({ radius: 10, bedrooms: 4 })), ["Legacy pin"]);
    assert.deepEqual(titles(await api({ radius: 10, amenities: "parking,Furnished" })), ["Furnished flat"]);
    assert.deepEqual(titles(await api({ radius: 10, type: "Townhouse,Villa" })), ["Agent home", "Sale house", "Legacy pin"]);
    assert.deepEqual(titles(await api({ radius: 10, sort: "priceAsc", listingType: "Rent" })), ["Rent far", "Rent near", "Furnished flat"]);
    assert.equal((await api({ radius: 10, availability: "Sold" })).data.total, 6, "sold listings can't be requested back in");
  });

  await t.test("pagination is applied on the server", async () => {
    const body = await api({ radius: 10, limit: 2, page: 2 });
    assert.deepEqual(titles(body), ["Sale house", "Legacy pin"]);
    assert.deepEqual({ total: body.data.total, page: body.data.page, pages: body.data.pages, limit: body.data.limit }, { total: 6, page: 2, pages: 3, limit: 2 });
    assert.deepEqual(titles(await api({ radius: 10, limit: 2, page: 4 })), []);
  });

  await t.test("guests never see agent identities; map markers carry public listing facts only", async () => {
    const agentHome = (await api({ radius: 2 })).data.items.find((item) => item.id === ids.agentHome);
    for (const key of ["agent", "contact", "owner"]) assert.equal(Object.hasOwn(agentHome, key), false, key);
    const markers = await api({ radius: 10, format: "markers" });
    assert.equal(markers.data.items.length, 6);
    const marker = markers.data.items[0];
    assert.equal(marker.id, ids.rentNear);
    assert.deepEqual(Object.keys(marker).sort(), ["availability", "bathrooms", "bedrooms", "currency", "distance", "id", "image", "isFeatured", "listingType", "location", "price", "pricePeriod", "propertyType", "ownerType", "title"].sort());
    assert.deepEqual(Object.keys(marker.location).sort(), ["city", "latitude", "longitude", "neighbourhood", "region"]);
    assert.equal(marker.image, base.images[0]);
  });

  await t.test("invalid locations and filters are refused with a clear message", async () => {
    for (const [params, message] of [
      [{ latitude: "" }, /valid location/], [{ latitude: 91 }, /valid location/], [{ longitude: "east" }, /valid location/],
      [{ radius: 3 }, /1, 2, 5, 10, 20, 50 km/], [{ radius: 500 }, /radius/], [{ minPrice: 900, maxPrice: 100 }, /minimum price is higher/],
      [{ bedrooms: -1 }, /bedrooms/], [{ maxPrice: "cheap" }, /maximum price/], [{ listingType: "Lease" }, /Rent or Sale/], [{ sort: "$where" }, /sort/],
    ]) {
      const body = await api(params);
      assert.equal(body.status, 400, JSON.stringify(params));
      assert.match(body.message, message);
    }
  });

  await t.test("map pins follow edits: added, moved and removed with the saved coordinates", async () => {
    const property = await Property.findById(noPin._id);
    property.location.latitude = north(0.2).latitude;
    property.location.longitude = north(0.2).longitude;
    await property.save();
    assert.deepEqual(titles(await api({ radius: 1 })), ["No pin", "Rent near"]);
    property.location.latitude = north(15).latitude;
    await property.save();
    assert.deepEqual(titles(await api({ radius: 1 })), ["Rent near"]);
    assert.equal((await api({ radius: 20 })).data.items.at(-1).title, "No pin");
    property.location.latitude = null;
    property.location.longitude = null;
    await property.save();
    assert.equal((await Property.findById(noPin._id).lean()).geo, undefined);
    assert.equal((await api({ radius: 50 })).data.total, 7);
    // Still an ordinary public listing in the normal search
    const listing = await (await fetch(`http://127.0.0.1:${server.address().port}/api/properties?page=1&search=No%20pin`)).json();
    assert.equal(listing.data.total, 1);
  });

  await t.test("saving a listing without a pin places it from its address; placing a pin makes it exact", async () => {
    const entry = "hbNearbyEntry_1234567890ab";
    const saved = { entry: process.env.ADMIN_ENTRY_PATH, geocoder: process.env.GEOCODER_URL };
    process.env.ADMIN_ENTRY_PATH = entry;
    delete process.env.GEOCODER_URL;
    t.after(() => { for (const [key, value] of [["ADMIN_ENTRY_PATH", saved.entry], ["GEOCODER_URL", saved.geocoder]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
    const realFetch = globalThis.fetch;
    const spintex = { type: "Feature", geometry: { type: "Point", coordinates: [-0.0902, 5.6288] }, properties: { osm_type: "N", osm_id: 1, name: "Spintex", type: "locality", city: "Accra", country: "Ghana", countrycode: "GH" } };
    t.mock.method(globalThis, "fetch", async (url, options) => String(url).startsWith("https://photon.komoot.io/")
      ? { ok: true, json: async () => ({ features: new URL(url).searchParams.get("q").startsWith("Spintex") ? [spintex] : [] }) }
      : realFetch(url, options));
    const { default: jwt } = await import("jsonwebtoken");
    const headers = { "Content-Type": "application/json", "X-Session-Domain": "admin", "X-Admin-Entry": entry, Cookie: `admin_token=${jwt.sign({ id: String(admin._id), role: "admin", session: "admin" }, process.env.JWT_KEY, { expiresIn: "1h" })}` };
    const call = async (method, path, body) => (await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers, body: JSON.stringify(body) })).json();

    const created = await call("POST", "/api/admin/properties", { title: "Spintex draft", listingType: "Rent", pricePeriod: "month", propertyType: "Apartment", price: 2500, status: "draft", location: { address: "Spintex Road", neighbourhood: "Spintex", city: "Accra" } });
    assert.equal(created.success, true, created.message);
    let doc = await Property.findById(created.data.id).lean();
    assert.equal(doc.location.pinSource, "address");
    assert.deepEqual(doc.geo.coordinates, [-0.0902, 5.6288], "placed at Spintex from the address");

    const moved = await call("PUT", `/api/admin/properties/${created.data.id}`, { location: { address: "Spintex Road", neighbourhood: "Spintex", city: "Accra", latitude: 5.6301, longitude: -0.0911 } });
    assert.equal(moved.success, true, moved.message);
    doc = await Property.findById(created.data.id).lean();
    assert.equal(doc.location.pinSource, "map", "a pin someone placed is exact");
    assert.deepEqual(doc.geo.coordinates, [-0.0911, 5.6301]);

    const renamed = await call("PUT", `/api/admin/properties/${created.data.id}`, { location: { address: "Spintex Road", neighbourhood: "Spintex East", city: "Accra", latitude: 5.6301, longitude: -0.0911 } });
    assert.equal(renamed.success, true, renamed.message);
    assert.deepEqual((await Property.findById(created.data.id).lean()).geo.coordinates, [-0.0911, 5.6301], "editing the address never moves a placed pin");
  });

  await t.test("normal search can filter by amenities too", async () => {
    const body = await (await fetch(`http://127.0.0.1:${server.address().port}/api/properties?page=1&amenities=Furnished`)).json();
    assert.deepEqual(body.data.items.map((item) => item.title), ["Furnished flat"]);
  });
});
