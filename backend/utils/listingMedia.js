import Property from "../models/Property.js";
import { getSettings } from "../models/Setting.js";
import { cloudinary } from "../config/cloudinary.js";
import { HttpError } from "./response.js";
import { reportError } from "./monitoring.js";

/*
 * Listing media in Cloudinary: an optional MP4 video per listing, and permanent deletion of photos and
 * videos a listing no longer uses.
 *
 * Videos are too large to pass through the API (Vercel accepts 4.5 MB per request), so the browser
 * uploads them straight to Cloudinary with a one-time signature from here (videoUploadParams). The
 * signature fixes the folder (the uploader's own), the formats, the conversion to MP4 and the
 * compression: Cloudinary stores a re-encoded copy (H.264, 720p at most, economy automatic quality), never
 * the raw file. The server then checks what Cloudinary actually stored (verifyVideo) and deletes
 * anything too long, too large or not a video. Uploads carry a "pending" tag until a listing is saved
 * with them; the daily job deletes pending uploads nobody saved (cleanUpAbandonedVideos).
 */
export const VIDEO_LIMITS = Object.freeze({ maxBytes: 50 * 1024 * 1024, maxSeconds: 120 });
const VIDEO_FORMATS = ["mp4", "mov", "webm", "m4v"];
const PENDING_TAG = "nyafie_pending_video";
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;
// Stored copy: H.264 MP4, 720p at most (1280px on the long side, landscape or portrait), economy
// automatic quality (small files that still look sharp on phones), AAC sound
const COMPRESSION = "c_limit,h_1280,w_1280/q_auto:eco,vc_h264,ac_aac";
const folderOf = (userId) => `nyafie/videos/${userId}`;
const VIDEO_ID = /^nyafie\/videos\/([a-f\d]{24})\/[\w-]{1,120}$/;

/** POST /api/uploads/video/signature: what the browser sends to Cloudinary with the file */
export const videoUploadParams = (userId) => {
  const { cloud_name: cloudName, api_key: apiKey, api_secret: secret } = cloudinary.config();
  const params = {
    timestamp: Math.round(Date.now() / 1000),
    folder: folderOf(userId),
    tags: PENDING_TAG,
    allowed_formats: VIDEO_FORMATS.join(","),
    format: "mp4",
    transformation: COMPRESSION,
  };
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    fields: { ...params, api_key: apiKey, signature: cloudinary.utils.api_sign_request(params, secret) },
    ...VIDEO_LIMITS,
  };
};

const destroyVideo = (publicId) => cloudinary.uploader.destroy(publicId, { resource_type: "video", invalidate: true });

/**
 * What Cloudinary stored for an uploaded video, checked: the uploader's own folder (uploaderIds),
 * a video format, within the size and length limits. A video over the limits is deleted at once.
 * Returns what the listing stores: { publicId, url, duration, bytes, width, height }.
 */
export const verifyVideo = async (publicId, uploaderIds) => {
  const owner = typeof publicId === "string" ? VIDEO_ID.exec(publicId)?.[1] : null;
  if (!owner || !uploaderIds.map(String).includes(owner)) throw new HttpError(400, "Upload the video again, then save.");
  let stored;
  try {
    stored = await cloudinary.api.resource(publicId, { resource_type: "video" });
  } catch (error) {
    if (error?.error?.http_code === 404) throw new HttpError(400, "The video upload wasn't found. Upload it again.");
    throw new HttpError(502, "The video couldn't be checked right now. Please try again.");
  }
  const problem = !VIDEO_FORMATS.includes(String(stored.format).toLowerCase()) ? "Choose an MP4, MOV or WebM video."
    : stored.bytes > VIDEO_LIMITS.maxBytes ? `Videos can be up to ${VIDEO_LIMITS.maxBytes / 1024 / 1024} MB.`
    : (stored.duration || 0) > VIDEO_LIMITS.maxSeconds + 1 ? `Videos can be up to ${VIDEO_LIMITS.maxSeconds / 60} minutes long.`
    : "";
  if (problem) {
    await destroyVideo(publicId).catch(() => {});
    throw new HttpError(400, problem);
  }
  return { publicId, url: stored.secure_url, duration: Math.round(stored.duration || 0), bytes: stored.bytes, width: stored.width, height: stored.height };
};

/**
 * The video a listing should have after an edit. body.videoFile: undefined (unchanged), null (remove)
 * or { publicId } (a new upload, verified). removed: the previous video's id, to delete after saving.
 */
export const resolveListingVideo = async (body, current, uploaderIds) => {
  if (body.videoFile === undefined) return { video: current || null, removed: null };
  const publicId = body.videoFile?.publicId || null;
  if (!publicId) return { video: null, removed: current?.publicId || null };
  if (publicId === current?.publicId) return { video: current, removed: null };
  return { video: await verifyVideo(publicId, uploaderIds), removed: current?.publicId || null };
};

/** A newly saved video is no longer pending (the daily clean-up leaves it alone) */
export const keepVideo = (video) => (video?.publicId
  ? cloudinary.uploader.remove_tag(PENDING_TAG, [video.publicId], { resource_type: "video" }).catch((error) => console.error("Video tag update failed:", error.message))
  : Promise.resolve());

/**
 * The Cloudinary file behind a stored address, or null for anything else (built-in site images,
 * other clouds, other folders): { publicId, resourceType }. Only the site's own upload folders.
 */
export const cloudinaryAsset = (url) => {
  const match = typeof url === "string" && /^https:\/\/res\.cloudinary\.com\/([^/]+)\/(image|video)\/upload\/(?:v\d+\/)?([^,?#]+?)(?:\.[a-z0-9]{2,5})?$/i.exec(url);
  if (!match || match[1] !== cloudinary.config().cloud_name) return null;
  if (!/^(nyafie|homebase)\//.test(match[3])) return null;
  return { publicId: match[3], resourceType: match[2] };
};

/** Every photo address a listing uses (its photos and its hotel room photos) */
export const listingImages = (property) => [
  ...(property?.images || []),
  ...(property?.roomTypes || []).flatMap((room) => room.images || []),
].filter((url) => typeof url === "string");

// Addresses the site's settings use (hero slides, logos, sharing image): never deleted with a listing
const settingsImages = async () => {
  const settings = await getSettings();
  return new Set([...(settings.hero?.slides || []).map((slide) => slide.image), settings.branding?.logo, settings.branding?.logoDark, settings.branding?.favicon, settings.seo?.ogImage].filter(Boolean));
};

/**
 * Permanently deletes photos (addresses) and videos (ids) from Cloudinary, including its cached
 * copies (invalidate), unless another listing or the site settings still use them. Called after the
 * change is saved. Never throws: a failure is logged and reported, and the listing change stands.
 * exceptId: the listing being changed or deleted.
 */
export const destroyListingMedia = async ({ images = [], videos = [] }, exceptId = null) => {
  try {
    const assets = [...new Set(images)].map((url) => ({ url, asset: cloudinaryAsset(url) })).filter((item) => item.asset);
    const videoIds = [...new Set(videos.filter(Boolean))];
    if (!assets.length && !videoIds.length) return;
    const others = exceptId ? { _id: { $ne: exceptId } } : {};
    const [usedImages, usedRoomImages, usedVideos, protectedImages] = await Promise.all([
      assets.length ? Property.distinct("images", { ...others, images: { $in: assets.map((item) => item.url) } }) : [],
      assets.length ? Property.distinct("roomTypes.images", { ...others, "roomTypes.images": { $in: assets.map((item) => item.url) } }) : [],
      videoIds.length ? Property.distinct("videoFile.publicId", { ...others, "videoFile.publicId": { $in: videoIds } }) : [],
      settingsImages(),
    ]);
    const inUse = new Set([...usedImages, ...usedRoomImages, ...protectedImages]);
    const targets = [
      ...assets.filter((item) => !inUse.has(item.url)).map(({ asset }) => asset),
      ...videoIds.filter((id) => !usedVideos.includes(id)).map((publicId) => ({ publicId, resourceType: "video" })),
    ];
    const results = await Promise.allSettled(targets.map(({ publicId, resourceType }) => cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true })));
    const failed = results.filter((result) => !(result.status === "fulfilled" && ["ok", "not found"].includes(result.value?.result)));
    if (failed.length) throw new Error(`${failed.length} of ${targets.length} listing media file(s) could not be deleted from Cloudinary.`);
  } catch (error) {
    console.error("Listing media clean-up:", error.message);
    await reportError(error, { tags: { area: "listing-media-deletion" } });
  }
};

/** Media a listing used before an edit and no longer uses after it */
export const removedMedia = (before, after) => ({
  images: listingImages(before).filter((url) => !listingImages(after).includes(url)),
  videos: before?.videoFile?.publicId && before.videoFile.publicId !== after?.videoFile?.publicId ? [before.videoFile.publicId] : [],
});

/**
 * Daily (the payments reconcile job): videos uploaded more than a day ago that no listing was saved
 * with are deleted. Videos a listing does use just lose the pending tag.
 */
export const cleanUpAbandonedVideos = async (now = Date.now()) => {
  const { resources = [] } = await cloudinary.api.resources_by_tag(PENDING_TAG, { resource_type: "video", max_results: 100 });
  const old = resources.filter((resource) => now - new Date(resource.created_at).getTime() > ABANDONED_AFTER_MS);
  if (!old.length) return { deleted: 0, kept: 0 };
  const used = new Set(await Property.distinct("videoFile.publicId", { "videoFile.publicId": { $in: old.map((resource) => resource.public_id) } }));
  const abandoned = old.filter((resource) => !used.has(resource.public_id)).map((resource) => resource.public_id);
  if (abandoned.length) await cloudinary.api.delete_resources(abandoned, { resource_type: "video", invalidate: true });
  if (used.size) await cloudinary.uploader.remove_tag(PENDING_TAG, [...used], { resource_type: "video" });
  return { deleted: abandoned.length, kept: used.size };
};
