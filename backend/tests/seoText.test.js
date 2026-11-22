import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPrice, placeLabel, placeSlug, propertyHeadline } from "../utils/seo.js";
import * as app from "../../frontend/src/utils/places.js";

const NAMES = ["East Legon", "Airport Residential", "Spintex Road", "Cantonments & Labone", "Adenta-Housing", "  Osu  ", "Kumasi", "Abokobi (North)", "Tse Addo", "Ɔdɔ Akwa"];

test("location page addresses are the same on the server and in the app", () => {
  for (const name of NAMES) assert.equal(app.placeSlug(name), placeSlug(name), name);
  assert.equal(placeSlug("East Legon"), "east-legon");
  assert.equal(placeSlug("Cantonments & Labone"), "cantonments-and-labone");
  assert.equal(placeSlug("  Osu  "), "osu");
  assert.equal(placeSlug("Ɔdɔ Akwa"), "odo-akwa", "Ghanaian letters keep their sound");
  assert.equal(placeSlug("Ɛkumfi"), "ekumfi");
  assert.equal(app.placePath("Sale", "East Legon"), "/sale/east-legon");
  assert.equal(app.placePath("Rent", "Accra"), "/rent/accra");
});

test("titles read the way people search, the same on the server and in the app", () => {
  const cases = [
    [{ propertyType: "House", listingType: "Rent", bedrooms: 3 }, "3-Bedroom House for Rent"],
    [{ propertyType: "Apartment", listingType: "Sale", bedrooms: 2 }, "2-Bedroom Apartment for Sale"],
    [{ propertyType: "Land", listingType: "Sale", bedrooms: 4 }, "Land for Sale"],
    [{ propertyType: "Hotel-Apartment", listingType: "Rent", bedrooms: 1 }, "Hotel Apartment"],
    [{ propertyType: "Office", listingType: "Rent", bedrooms: 0 }, "Office for Rent"],
  ];
  for (const [property, expected] of cases) {
    assert.equal(propertyHeadline(property), expected);
    assert.equal(app.propertyHeadline(property), expected);
  }
  assert.equal(placeLabel({ neighbourhood: "East Legon", city: "Accra" }), "East Legon, Accra");
  assert.equal(placeLabel({ neighbourhood: "Accra", city: "Accra" }), "Accra");
  assert.equal(placeLabel({}), "Ghana");
  assert.equal(app.placeLabel({ neighbourhood: "East Legon", city: "Accra" }), "East Legon, Accra");
  assert.equal(formatPrice(5000, "month"), "GH₵5,000/month");
  assert.equal(formatPrice(1250000, "total"), "GH₵1,250,000");
});

test("a location page finds its neighbourhood first, then its city", () => {
  const facets = { areas: [{ name: "East Legon", city: "Accra" }, { name: "Accra", city: "Accra" }], cities: [{ name: "Accra" }, { name: "Kumasi" }] };
  assert.deepEqual(app.findPlace(facets, "east-legon"), { area: "East Legon", city: "Accra", label: "East Legon, Accra" });
  assert.deepEqual(app.findPlace(facets, "accra"), { area: "Accra", city: "Accra", label: "Accra" });
  assert.deepEqual(app.findPlace(facets, "kumasi"), { city: "Kumasi", label: "Kumasi" });
  assert.equal(app.findPlace(facets, "tamale"), null);
});
