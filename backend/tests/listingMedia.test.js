import { test } from "node:test";
import assert from "node:assert/strict";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import User from "../models/User.js";
import { cloudinary } from "../config/cloudinary.js";
import { mayUseStoredImage, resolveImages } from "../utils/uploadImages.js";
import { VIDEO_LIMITS, cleanUpAbandonedVideos, cloudinaryAsset, destroyListingMedia, removedMedia, resolveListingVideo, verifyVideo, videoUploadParams } from "../utils/listingMedia.js";

const CLOUD = "nyafie-test";
const AGENT = "6a1b2c3d4e5f60718293a4b5";
const OTHER = "6a1b2c3d4e5f60718293a4b6";
const photo = (name) => `https://res.cloudinary.com/${CLOUD}/image/upload/v1700000000/nyafie/uploads/${AGENT}/${name}.jpg`;
const query = (value) => ({ then: (yes, no) => Promise.resolve(value).then(yes, no), lean: () => query(value), select: () => query(value) });

// A Cloudinary account in memory: what is stored, and what was deleted
const fakeCloudinary = (t, stored = {}) => {
  cloudinary.config({ cloud_name: CLOUD, api_key: "key", api_secret: "secret-for-tests" });
  const destroyed = [];
  t.mock.method(cloudinary.api, "resource", async (publicId) => {
    if (!stored[publicId]) throw { error: { http_code: 404 } };
    return { public_id: publicId, secure_url: `https://res.cloudinary.com/${CLOUD}/video/upload/v1/${publicId}.mp4`, ...stored[publicId] };
  });
  t.mock.method(cloudinary.uploader, "destroy", async (publicId, options) => { destroyed.push({ publicId, ...options }); return { result: "ok" }; });
  return destroyed;
};

test("stored addresses map to Cloudinary files only for the site's own uploads", (t) => {
  fakeCloudinary(t);
  assert.deepEqual(cloudinaryAsset(photo("kitchen")), { publicId: `nyafie/uploads/${AGENT}/kitchen`, resourceType: "image" });
  assert.deepEqual(cloudinaryAsset(`https://res.cloudinary.com/${CLOUD}/video/upload/v2/nyafie/videos/${AGENT}/tour.mp4`), { publicId: `nyafie/videos/${AGENT}/tour`, resourceType: "video" });
  assert.equal(cloudinaryAsset(`https://res.cloudinary.com/${CLOUD}/image/upload/v1/homebase/uploads/x/logo.png`).publicId, "homebase/uploads/x/logo", "older uploads too");
  for (const url of [
    "https://res.cloudinary.com/someone-else/image/upload/v1/nyafie/uploads/x/a.jpg", // another account
    `https://res.cloudinary.com/${CLOUD}/image/upload/v1/samples/beach.jpg`, // not our folders
    `https://res.cloudinary.com/${CLOUD}/image/upload/f_auto,q_auto/v1/nyafie/uploads/x/a.jpg`, // a transformed copy
    "/hero/nyafie-modern-villa.jpg", "https://example.com/a.jpg", null,
  ]) assert.equal(cloudinaryAsset(url), null, String(url));
});

test("the upload signature fixes the uploader's folder, MP4 output and compression", (t) => {
  fakeCloudinary(t);
  const permit = videoUploadParams(AGENT);
  assert.equal(permit.uploadUrl, `https://api.cloudinary.com/v1_1/${CLOUD}/video/upload`);
  // One signature, one file in the uploader's folder, which it can't replace after it was checked
  assert.match(permit.fields.public_id, new RegExp(`^nyafie/videos/${AGENT}/[a-f0-9]{24}$`));
  assert.notEqual(videoUploadParams(AGENT).fields.public_id, permit.fields.public_id);
  assert.equal(permit.fields.overwrite, "false");
  assert.equal(permit.fields.format, "mp4");
  assert.match(permit.fields.transformation, /c_limit,h_1280,w_1280/);
  assert.match(permit.fields.transformation, /q_auto:eco/);
  assert.equal(permit.fields.tags, "nyafie_pending_video");
  assert.equal(permit.maxBytes, VIDEO_LIMITS.maxBytes);
  const { signature, api_key: _key, ...signed } = permit.fields;
  assert.equal(signature, cloudinary.utils.api_sign_request(signed, "secret-for-tests"), "Cloudinary rejects any change to these values");
  assert.equal(JSON.stringify(permit).includes("secret-for-tests"), false, "the secret never leaves the server");
});

test("a video is checked against what Cloudinary stored; over the limits it is deleted", async (t) => {
  const id = (name) => `nyafie/videos/${AGENT}/${name}`;
  const destroyed = fakeCloudinary(t, {
    [id("good")]: { format: "mp4", bytes: 12 * 1024 * 1024, duration: 95.4, width: 1280, height: 720 },
    [id("long")]: { format: "mp4", bytes: 9 * 1024 * 1024, duration: 600 },
    [id("huge")]: { format: "mp4", bytes: 80 * 1024 * 1024, duration: 60 },
    [id("doc")]: { format: "pdf", bytes: 1000, duration: 0 },
  });
  const good = await verifyVideo(id("good"), [AGENT]);
  assert.deepEqual(good, { publicId: id("good"), url: `https://res.cloudinary.com/${CLOUD}/video/upload/v1/${id("good")}.mp4`, duration: 95, bytes: 12 * 1024 * 1024, width: 1280, height: 720 });
  for (const [name, message] of [["long", /2 minutes/], ["huge", /50 MB/], ["doc", /MP4, MOV or WebM/]]) {
    await assert.rejects(verifyVideo(id(name), [AGENT]), message);
    assert.ok(destroyed.some((entry) => entry.publicId === id(name) && entry.resource_type === "video"), `${name} is deleted`);
  }
  // Someone else's upload, or anything outside the video folders, is refused without a lookup
  await assert.rejects(verifyVideo(`nyafie/videos/${OTHER}/theirs`, [AGENT]), (error) => error.status === 400);
  await assert.rejects(verifyVideo("nyafie/uploads/x/photo", [AGENT]), (error) => error.status === 400);
  await assert.rejects(verifyVideo(id("missing"), [AGENT]), /wasn't found/);
});

test("editing a listing keeps, replaces or removes its video", async (t) => {
  fakeCloudinary(t, { [`nyafie/videos/${AGENT}/new`]: { format: "mp4", bytes: 1000, duration: 10 } });
  const current = { publicId: `nyafie/videos/${AGENT}/old`, url: "https://x/old.mp4" };
  assert.deepEqual(await resolveListingVideo({}, current, [AGENT]), { video: current, removed: null }, "not sent: unchanged");
  assert.deepEqual(await resolveListingVideo({ videoFile: { publicId: current.publicId } }, current, [AGENT]), { video: current, removed: null });
  assert.deepEqual(await resolveListingVideo({ videoFile: null }, current, [AGENT]), { video: null, removed: current.publicId });
  const replaced = await resolveListingVideo({ videoFile: { publicId: `nyafie/videos/${AGENT}/new` } }, current, [AGENT]);
  assert.equal(replaced.video.publicId, `nyafie/videos/${AGENT}/new`);
  assert.equal(replaced.removed, current.publicId);
  // What an edit stops using: removed photos (also hotel room photos) and a replaced video
  const before = { images: [photo("a"), photo("b")], roomTypes: [{ images: [photo("room")] }], videoFile: current };
  const after = { images: [photo("b")], roomTypes: [], videoFile: replaced.video };
  assert.deepEqual(removedMedia(before, after), { images: [photo("a"), photo("room")], videos: [current.publicId] });
  assert.deepEqual(removedMedia({ images: before.images, videoFile: current }, { images: [photo("a"), photo("b")], videoFile: current }), { images: [], videos: [] });
});

test("removed photos and videos are deleted for good, unless another listing or the site still uses them", async (t) => {
  const destroyed = fakeCloudinary(t);
  t.mock.method(Property, "distinct", async (field, filter) => {
    if (field === "images") return filter.images.$in.filter((url) => url === photo("shared"));
    if (field === "videoFile.publicId") return filter["videoFile.publicId"].$in.filter((id) => id.endsWith("/shared-video"));
    return [];
  });
  t.mock.method(Setting, "findOneAndUpdate", () => query({ key: "platform", hero: { slides: [{ image: photo("hero") }] } }));
  t.mock.method(User, "distinct", async () => []);
  await destroyListingMedia({
    images: [photo("gone"), photo("shared"), photo("hero"), "/built-in.jpg", photo("gone")],
    videos: [`nyafie/videos/${AGENT}/old`, `nyafie/videos/${AGENT}/shared-video`, null],
  }, "listing-id");
  assert.deepEqual(destroyed.map((entry) => entry.publicId).sort(), [`nyafie/uploads/${AGENT}/gone`, `nyafie/videos/${AGENT}/old`].sort());
  assert.ok(destroyed.every((entry) => entry.invalidate === true), "cached copies are cleared too");
  assert.equal(destroyed.find((entry) => entry.publicId.endsWith("/old")).resource_type, "video");
  // Nothing to do: no database or Cloudinary calls at all
  await destroyListingMedia({ images: ["/built-in.jpg"], videos: [] });
  assert.equal(destroyed.length, 2);
  // A Cloudinary failure never breaks the listing change
  cloudinary.uploader.destroy.mock.mockImplementation(async () => { throw new Error("Cloudinary down"); });
  t.mock.method(console, "error", () => {});
  await assert.doesNotReject(destroyListingMedia({ images: [photo("later")] }));
});

test("a listing never deletes an account's profile photo or agency logo", async (t) => {
  const destroyed = fakeCloudinary(t);
  const avatar = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/nyafie/uploads/${OTHER}/avatar.jpg`;
  const logo = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/nyafie/uploads/${OTHER}/logo.png`;
  const profile = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/nyafie/profiles/${OTHER}/me.jpg`;
  t.mock.method(Property, "distinct", async () => []);
  t.mock.method(Setting, "findOneAndUpdate", () => query({ key: "platform" }));
  t.mock.method(User, "distinct", async (field, filter) => {
    if (field === "profileImage") return filter.profileImage.$in.filter((url) => [avatar, profile].includes(url));
    if (field === "agentApplication.agencyLogo") return filter["agentApplication.agencyLogo"].$in.filter((url) => url === logo);
    return [];
  });
  await destroyListingMedia({ images: [avatar, logo, profile, photo("gone")] }, "listing-id");
  assert.deepEqual(destroyed.map((entry) => entry.publicId), [`nyafie/uploads/${AGENT}/gone`]);
});

test("a listing only takes the site's stored photos it already has or its editor uploaded", async (t) => {
  fakeCloudinary(t);
  const theirs = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/nyafie/uploads/${OTHER}/logo.png`;
  const listingPhoto = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/nyafie/properties/front.jpg`;
  const owned = { current: [listingPhoto], uploaderIds: [AGENT] };
  assert.equal(mayUseStoredImage(photo("mine"), owned), true, "the editor's own upload");
  assert.equal(mayUseStoredImage(listingPhoto, owned), true, "already on the listing");
  assert.equal(mayUseStoredImage(theirs, owned), false, "another account's upload");
  assert.equal(mayUseStoredImage(`https://res.cloudinary.com/${CLOUD}/image/upload/v1/nyafie/properties/other.jpg`, owned), false, "another listing's photo");
  assert.equal(mayUseStoredImage(`https://res.cloudinary.com/${CLOUD}/image/upload/v1/nyafie/uploads/${AGENT}0/x.jpg`, owned), false, "an id that only starts the same");
  // Never deleted by the site, so always allowed: built-in images and other hosts
  assert.equal(mayUseStoredImage("/hero/villa.jpg", owned), true);
  assert.equal(mayUseStoredImage("https://example.com/a.jpg", owned), true);
  assert.deepEqual(await resolveImages([photo("mine"), listingPhoto], owned), [photo("mine"), listingPhoto]);
  await assert.rejects(resolveImages([photo("mine"), theirs], owned), (error) => error.status === 400);
  // Profiles (whose old images are never deleted) still resolve without the listing rule
  assert.deepEqual(await resolveImages([theirs]), [theirs]);
});

test("videos uploaded but never saved with a listing are deleted after a day", async (t) => {
  fakeCloudinary(t);
  const now = Date.parse("2026-11-22T12:00:00Z");
  const hoursAgo = (hours) => new Date(now - hours * 3600000).toISOString();
  t.mock.method(cloudinary.api, "resources_by_tag", async () => ({ resources: [
    { public_id: "nyafie/videos/a/abandoned", created_at: hoursAgo(30) },
    { public_id: "nyafie/videos/a/saved", created_at: hoursAgo(48) },
    { public_id: "nyafie/videos/a/still-editing", created_at: hoursAgo(2) },
  ] }));
  t.mock.method(Property, "distinct", async () => ["nyafie/videos/a/saved"]);
  const deleted = [];
  const untagged = [];
  t.mock.method(cloudinary.api, "delete_resources", async (ids, options) => { deleted.push(...ids); assert.equal(options.resource_type, "video"); return {}; });
  t.mock.method(cloudinary.uploader, "remove_tag", async (_tag, ids) => { untagged.push(...ids); return {}; });
  assert.deepEqual(await cleanUpAbandonedVideos(now), { deleted: 1, kept: 1 });
  assert.deepEqual(deleted, ["nyafie/videos/a/abandoned"]);
  assert.deepEqual(untagged, ["nyafie/videos/a/saved"]);
});

test("the abandoned-video clean-up reads every page and deletes in batches", async (t) => {
  fakeCloudinary(t);
  const now = Date.parse("2026-11-22T12:00:00Z");
  const old = new Date(now - 48 * 3600000).toISOString();
  const all = Array.from({ length: 650 }, (_, i) => ({ public_id: `nyafie/videos/a/v${i}`, created_at: old }));
  t.mock.method(cloudinary.api, "resources_by_tag", async (_tag, options) => (options.next_cursor
    ? { resources: all.slice(500) }
    : { resources: all.slice(0, 500), next_cursor: "page-2" }));
  t.mock.method(Property, "distinct", async () => []);
  const batches = [];
  t.mock.method(cloudinary.api, "delete_resources", async (ids) => { batches.push(ids.length); return {}; });
  assert.deepEqual(await cleanUpAbandonedVideos(now), { deleted: 650, kept: 0 });
  assert.equal(cloudinary.api.resources_by_tag.mock.callCount(), 2);
  assert.ok(batches.every((size) => size <= 100));
  assert.equal(batches.reduce((a, b) => a + b, 0), 650);
});
