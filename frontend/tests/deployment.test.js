import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareImagePayload } from "../src/utils/imagePayload.js";
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

test("directory totals survive a bounded shared property cache", () => {
  const [agent] = mergeAgents([{ id: 'a', name: 'Akua', propertyCount: 95, saleCount: 40, rentCount: 55, locations: ['Accra'], rating: 4.5 }], []);
  assert.equal(agent.propertyCount, 95);
  assert.equal(agent.rentCount, 55);
  assert.equal(agent.rating, 4.5);
  assert.deepEqual(agent.properties, []);
});
