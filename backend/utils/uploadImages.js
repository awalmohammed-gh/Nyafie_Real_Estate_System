import { cloudinary } from "../config/cloudinary.js";
import { HttpError } from "./response.js";

const MAX_BYTES = 8 * 1024 * 1024;
// Longest side kept for a stored photo: the largest size any page asks for (full-width hero slides)
export const MAX_STORED_SIZE = 2560;

/**
 * Cloudinary upload options with an incoming transformation, so the stored file is already compressed
 * even when a client skips the browser's compression: photos are capped at MAX_STORED_SIZE on the
 * longest side (never enlarged) and JPEG/WebP are re-encoded at Cloudinary's automatic quality.
 * PNGs keep lossless encoding (logos, transparency); SVGs and GIFs are stored exactly as sent.
 */
export const imageUploadOptions = (image, options) => {
  const type = /^data:image\/(jpeg|png|webp);/i.exec(image)?.[1]?.toLowerCase();
  if (!type) return options;
  const transformation = [{ width: MAX_STORED_SIZE, height: MAX_STORED_SIZE, crop: "limit" }];
  if (type !== "png") transformation.push({ quality: "auto:good" });
  return { ...options, transformation };
};

/**
 * Accepts a mix of already-stored URLs and new images sent as data URIs
 * (the frontend compresses photos before sending). New images are uploaded to
 * Cloudinary and only their URLs are returned for storage in MongoDB.
 */
export const resolveImages = async (images = []) => {
  if (!Array.isArray(images)) throw new HttpError(400, "Images must be a list.");

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
      if (image.length <= 2048 && (/^https:\/\/[^\s"'<>]+$/.test(image) || /^\/(?!\/)[^\s"'<>]*$/.test(image))) return image;
      throw new HttpError(400, "Invalid image.");
    })
  );
};
