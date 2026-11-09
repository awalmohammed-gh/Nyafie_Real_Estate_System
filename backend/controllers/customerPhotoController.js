import User from "../models/User.js";
import { cloudinary } from "../config/cloudinary.js";
import { fail, ok } from "../utils/response.js";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Accept raster image data only; remote URLs and arbitrary profile field updates
// never reach the image provider through this customer-only endpoint.
export const uploadCustomerPhoto = async (req, res) => {
  const image = req.body?.image;
  if (typeof image !== "string" || image.length > 3 * 1024 * 1024) return fail(res, 400, "Choose a JPG, PNG or WebP photo.");
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z\d+/]+={0,2})$/.exec(image);
  if (!match) return fail(res, 400, "Choose a JPG, PNG or WebP photo.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_IMAGE_BYTES) return fail(res, 413, "This photo is too large. Choose a smaller photo.");
  const valid = match[1] === "jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : match[1] === "png" ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!valid || bytes.toString("base64") !== match[2]) return fail(res, 400, "This file isn't a valid photo.");

  let result;
  try {
    result = await cloudinary.uploader.upload(image, {
      folder: `nyafie/profiles/${req.user._id}`,
      resource_type: "image",
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [{ width: 512, height: 512, crop: "fill", gravity: "auto" }, { quality: "auto", fetch_format: "webp" }],
      overwrite: false,
    });
  } catch {
    return fail(res, 502, "Your photo couldn't be uploaded. Please try again.");
  }
  if (!result.secure_url?.startsWith("https://")) return fail(res, 502, "Your photo couldn't be uploaded. Please try again.");
  // Update only the avatar so concurrent name or preference edits aren't lost.
  const user = await User.findByIdAndUpdate(req.user._id, { $set: { profileImage: result.secure_url } }, { new: true, runValidators: true });
  if (!user) return fail(res, 404, "Account not found.");
  ok(res, user, "Profile photo updated");
};

export const removeCustomerPhoto = async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user._id, { $set: { profileImage: "" } }, { new: true, runValidators: true });
  if (!user) return fail(res, 404, "Account not found.");
  ok(res, user, "Profile photo removed");
};
