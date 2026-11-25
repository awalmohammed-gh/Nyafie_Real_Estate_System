import { test } from "node:test";
import assert from "node:assert/strict";
import { priceLabel, priceRanges, priceUnit, sortsFor, tabCount, tabFacets, tabOf, tabQuery } from "../src/utils/browseTabs.js";
import { bannerHeading } from "../src/utils/listingBanner.js";
import { listingLabel } from "../src/utils/property.js";

test("Rent means homes to live in; nightly homes are short stays", () => {
  assert.deepEqual([tabOf({ listingType: "Rent" }), tabOf({ listingType: "", stay: true }), tabOf({ listingType: "Sale" }), tabOf({})], ["Rent", "stay", "Sale", ""]);
  assert.deepEqual(tabQuery("Rent"), { listingType: "Rent", stay: "false" });
  assert.deepEqual(tabQuery("Rent", { allRentals: true }), { listingType: "Rent", stay: undefined }, "a location page lists every rental there");
  assert.deepEqual(tabQuery("stay"), { listingType: undefined, stay: "true" });
  assert.deepEqual(tabQuery(""), { listingType: undefined, stay: undefined });
  assert.deepEqual([tabFacets("Rent"), tabFacets("Rent", { allRentals: true }), tabFacets("stay")], ["Rent", "RentAll", "stay"]);
  const facets = { total: 12, sale: 6, rent: 6, rentHomes: 4, stays: 2 };
  assert.deepEqual(["", "Sale", "Rent", "stay"].map((tab) => tabCount(facets, tab)), [12, 6, 4, 2]);
  assert.equal(tabCount(undefined, "Sale"), undefined);
});

test("prices are compared only within a tab", () => {
  const sorts = [{ value: "" }, { value: "latest" }, { value: "priceAsc" }, { value: "priceDesc" }];
  assert.deepEqual(sortsFor("", sorts).map(({ value }) => value), ["", "latest"]);
  assert.equal(sortsFor("Rent", sorts).length, 4);
  assert.deepEqual(priceRanges(""), []);
  for (const tab of ["Sale", "Rent", "stay"]) {
    const ranges = priceRanges(tab);
    assert.equal(ranges[0].min, 0);
    assert.equal(ranges.at(-1).max, null);
    ranges.slice(1).forEach((range, i) => assert.equal(range.min, ranges[i].max + 1, "no gaps and no overlaps"));
  }
  assert.deepEqual([priceUnit("Rent"), priceUnit("stay"), priceUnit("")], ["per month", "per night", ""]);
  assert.equal(priceLabel("Rent", 1001, 2000), "₵1,001 – ₵2,000");
  assert.equal(priceLabel("Rent", null, 750), "Up to ₵750", "an older or shared link");
  assert.equal(priceLabel("", 5000, null), "From ₵5,000");
});

test("cards and headings name a short stay as one", () => {
  assert.equal(listingLabel({ property: { status: "Rent", type: "Villa" }, pricing: { perNight: 1200 } }), "Short Stay");
  assert.equal(listingLabel({ property: { status: "Rent", type: "Hotel" }, pricing: {} }), "Short Stay");
  assert.equal(listingLabel({ property: { status: "Rent", type: "Villa" }, pricing: { perMonth: 1200 } }), "For Rent");
  assert.equal(listingLabel({ property: { status: "Sale", type: "Hotel-Apartment" }, pricing: { amount: 9 } }), "For Sale");
  const stay = { kind: "intent", value: "stay", label: "Short stays" };
  assert.equal(bannerHeading([stay], "x"), "Short stays");
  assert.equal(bannerHeading([stay, { kind: "type", value: "Villa", label: "Villa" }, { kind: "city", value: "Accra", label: "Accra" }], "x"), "Villa short stays in Accra");
});
