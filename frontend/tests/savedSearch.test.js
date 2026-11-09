import { test } from "node:test";
import assert from "node:assert/strict";
import { describeFilters, hasSearchCriteria, savedSearchPath, toSavedFilters } from "../src/utils/savedSearch.js";

const browse = { listingType: "Rent", types: ["Apartment"], area: "East Legon", city: "", region: "", price: { min: null, max: 3000 }, beds: 2, baths: 0, availability: "", amenities: ["Parking"] };

test("a saved search reopens exactly the same results on the listings page", () => {
  const saved = toSavedFilters({ filters: browse, search: " garden ", near: null });
  assert.deepEqual(saved, { listingType: "Rent", types: ["Apartment"], area: "East Legon", city: "", region: "", minPrice: null, maxPrice: 3000, bedrooms: 2, bathrooms: 0, availability: "", amenities: ["Parking"], search: "garden", near: null });
  const url = new URL(savedSearchPath(saved, "/listings"), "https://site.example");
  assert.equal(url.pathname, "/listings");
  assert.deepEqual(Object.fromEntries(url.searchParams), { status: "Rent", type: "Apartment", area: "East Legon", maxPrice: "3000", bedrooms: "2", amenities: "Parking", search: "garden" });
  assert.deepEqual(describeFilters(saved), ["To rent", "Apartment", "2+ beds", "East Legon", "Up to ₵3,000", "Parking", "“garden”"]);
});

test("searches near a place keep the place and radius; a still-locating device position is not saved", () => {
  const near = { source: "place", latitude: 5.6037, longitude: -0.187, radius: 5, label: "Accra Central" };
  const saved = toSavedFilters({ filters: { ...browse, types: [], amenities: [], beds: 0, price: null }, near });
  assert.deepEqual(saved.near, { latitude: 5.6037, longitude: -0.187, radius: 5, label: "Accra Central" });
  const url = new URL(savedSearchPath(saved, "/listings"), "https://site.example");
  assert.equal(url.searchParams.get("near"), "5.6037,-0.187");
  assert.equal(url.searchParams.get("radius"), "5");
  assert.equal(toSavedFilters({ filters: browse, near: { source: "device", pending: true } }).near, null);
  assert.equal(toSavedFilters({ filters: browse, near: { source: "device", latitude: 5.6, longitude: -0.2, radius: 2 } }).near.label, "your location");
});

test("an empty search has nothing to save", () => {
  const empty = { listingType: "", types: [], area: "", city: "", region: "", price: null, beds: 0, baths: 0, availability: "", amenities: [] };
  assert.equal(hasSearchCriteria(toSavedFilters({ filters: empty })), false);
  assert.equal(hasSearchCriteria(toSavedFilters({ filters: empty, search: "pool" })), true);
});
