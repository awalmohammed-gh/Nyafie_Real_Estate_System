import { cloudinary } from "../config/cloudinary.js";
import { HttpError } from "./response.js";

const MAX_BYTES = 8 * 1024 * 1024;

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
        const result = await cloudinary.uploader.upload(image, { folder: "homebase/properties", resource_type: "image" });
        return result.secure_url;
      }
      if (/^https?:\/\//.test(image) || image.startsWith("/")) return image;
      throw new HttpError(400, "Invalid image.");
    })
  );
};
