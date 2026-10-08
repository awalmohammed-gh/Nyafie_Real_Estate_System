import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareImagePayload, prepareRequestImagePayload } from "../src/utils/imagePayload.js";
import { isListingPublic, mergeAgents } from "../src/utils/property.js";

test("dashboard visibility is independent of the first public property page", () => {
  const property = { id: "older-listing", listing: { state: "published" }, owner: { type: "agent", id: "approved-agent" } };
  assert.equal(isListingPublic(property, [{ id: "approved-agent", properties: [] }]), true);
  assert.equal(isListingPublic(property, []), false);
  assert.equal(isListingPublic({ ...property, listing: { state: "draft" } }, [{ id: "approved-agent" }]), false);
  assert.equal(isListingPublic({ ...property, owner: { type: "admin" } }, []), true);
});

test("image saves upload individually, preserve order, deduplicate and never mutate the form", async () => {
  const photo = "data:image/jpeg;base64,YQ==";
  const logo = "data:image/png;base64,Yg==";
  const form = { images: [photo, '/existing.jpg', photo], profileImage: logo, hero: { slides: [{ image: photo }] }, message: photo };
  const snapshot = structuredClone(form);
  const calls = [];
  const result = await prepareImagePayload(form, async (image) => { calls.push(image); return `https://res.cloudinary.com/test/${calls.length}.jpg`; });
  assert.deepEqual(calls, [photo, logo]);
  assert.deepEqual(form, snapshot);
  assert.deepEqual(result.images, ['https://res.cloudinary.com/test/1.jpg', '/existing.jpg', 'https://res.cloudinary.com/test/1.jpg']);
  assert.equal(result.hero.slides[0].image, result.images[0]);
  assert.equal(result.message, photo);
});

test("failed image uploads keep editable form data intact", async () => {
  const form = { images: ["data:image/jpeg;base64,YQ=="] };
  const snapshot = structuredClone(form);
  await assert.rejects(prepareImagePayload(form, async () => { throw new Error('Upload failed'); }), /Upload failed/);
  assert.deepEqual(form, snapshot);
});

test("customer profile photos reach their dedicated endpoint without an owner-only upload", async () => {
  const data = { image: "data:image/jpeg;base64,/9j/" };
  const upload = () => { throw new Error("Customers cannot use the owner upload endpoint"); };
  assert.equal(await prepareRequestImagePayload({ url: "/auth/customer/me/photo", method: "post", data }, upload), data);
  assert.equal(await prepareRequestImagePayload({ url: "/uploads/image", method: "post", data }, upload), data);
  let uploads = 0;
  const listing = await prepareRequestImagePayload({ url: "/properties", method: "post", data }, async () => { uploads++; return "https://example.test/photo.jpg"; });
  assert.equal(uploads, 1);
  assert.equal(listing.image, "https://example.test/photo.jpg");
});

test("directory totals survive a bounded shared property cache", () => {
  const [agent] = mergeAgents([{ id: 'a', name: 'Akua', propertyCount: 95, saleCount: 40, rentCount: 55, locations: ['Accra'], rating: 4.5 }], []);
  assert.equal(agent.propertyCount, 95);
  assert.equal(agent.rentCount, 55);
  assert.equal(agent.rating, 4.5);
  assert.deepEqual(agent.properties, []);
});
