import { cloudinary } from "../config/cloudinary.js";
import { HttpError } from "./response.js";
import { cloudinaryAsset } from "./listingMedia.js";

const MAX_BYTES = 8 * 1024 * 1024;
// Longest side kept for a stored photo: the largest size any page asks for (full-width hero slides)
export const MAX_STORED_SIZE = 2560;

/**
 * Cloudinary upload options with an incoming transformation, so the stored file is already compressed
 * even when a client skips the browser's compression: photos are capped at MAX_STORED_SIZE on the
 * longest side (never enlarged) and JPEG/WebP are re-encoded at Cloudinary's automatic quality.
 * PNGs keep lossless encoding (logos, transparency); GIFs are stored exactly as sent.
 * SVGs are converted to PNG: an SVG file can carry scripts, and is never stored as sent.
 */
export const imageUploadOptions = (image, options) => {
  if (/^data:image\/svg\+xml;/i.test(image)) return { ...options, format: "png", transformation: [{ width: MAX_STORED_SIZE, height: MAX_STORED_SIZE, crop: "limit" }] };
  const type = /^data:image\/(jpeg|png|webp);/i.exec(image)?.[1]?.toLowerCase();
  if (!type) return options;
  const transformation = [{ width: MAX_STORED_SIZE, height: MAX_STORED_SIZE, crop: "limit" }];
  if (type !== "png") transformation.push({ quality: "auto:good" });
  return { ...options, transformation };
};

/**
 * Whether a stored address may be saved on a listing. Files in the site's own Cloudinary folders are
 * deleted when a listing stops using them (utils/listingMedia.js), so a listing may only take such a
 * file if it already had it, or if the person saving uploaded it (POST /api/uploads/image stores it in
 * nyafie/uploads/<their id>/). Otherwise copying someone's public avatar or agency logo into a listing
 * and removing it again would delete their file. Addresses outside the site's folders are never deleted.
 */
export const mayUseStoredImage = (url, { current = [], uploaderIds = [] } = {}) => {
  const asset = cloudinaryAsset(url);
  if (!asset) return true;
  if (current.includes(url)) return true;
  return uploaderIds.some((id) => asset.publicId.startsWith(`nyafie/uploads/${id}/`));
};

/**
 * Accepts a mix of already-stored URLs and new images sent as data URIs
 * (the frontend compresses photos before sending). New images are uploaded to
 * Cloudinary and only their URLs are returned for storage in MongoDB.
 * listing: { current, uploaderIds } for listing photos, whose unused files are later deleted:
 * stored site files must already be on the listing or be the uploader's own (mayUseStoredImage).
 */
export const resolveImages = async (images = [], listing = null) => {
  if (!Array.isArray(images)) throw new HttpError(400, "Images must be a list.");
  const ownership = listing && { current: listing.current || [], uploaderIds: (listing.uploaderIds || []).map(String) };

  return Promise.all(
    images.map(async (image) => {
      if (typeof image !== "string") throw new HttpError(400, "Invalid image.");
      if (image.startsWith("data:image/")) {
        // base64 length * 3/4 is roughly the byte size
        if (image.length * 0.75 > MAX_BYTES) throw new HttpError(413, "Each photo must be smaller than 8MB.");
        const result = await cloudinary.uploader.upload(image, imageUploadOptions(image, { folder: "nyafie/properties", resource_type: "image" }));
        return result.secure_url;
      }
      // Already-stored images: https URLs (Cloudinary) or the site's own /paths. Never plain http,
      // protocol-relative "//host" URLs, other schemes, or overlong strings.
      if (image.length <= 2048 && (/^https:\/\/[^\s"'<>]+$/.test(image) || /^\/(?!\/)[^\s"'<>]*$/.test(image))) {
        if (ownership && !mayUseStoredImage(image, ownership)) throw new HttpError(400, "One of the photos belongs to another account. Upload the photo again.");
        return image;
      }
      throw new HttpError(400, "Invalid image.");
    })
  );
};
