import { Router } from "express";
import { protectUpload } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/security.js";
import { cloudinary } from "../config/cloudinary.js";
import { fail, ok } from "../utils/response.js";
import { imageUploadOptions } from "../utils/uploadImages.js";
import { verifyVideo, videoUploadParams } from "../utils/listingMedia.js";
import { approvedAgent } from "../utils/agentApplication.js";

const router = Router();
const blocked = (user) => !user.isActive || (user.role === "agent" && user.agentApplication?.status === "suspended");
router.post("/image", protectUpload, rateLimit({ windowMs: 15 * 60 * 1000, max: 60, key: (req) => String(req.user._id) }), async (req, res) => {
  if (blocked(req.user)) return fail(res, 403, "Your account cannot upload images.");
  const image = req.body.image;
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp|gif|svg\+xml);base64,[a-z\d+/]+={0,2}$/i.test(image)) return fail(res, 400, "Choose a supported image.");
  if (Buffer.byteLength(image, "utf8") > 3 * 1024 * 1024) return fail(res, 413, "This image is too large. Choose a smaller image.");
  // Stored already resized and compressed (see imageUploadOptions)
  const result = await cloudinary.uploader.upload(image, imageUploadOptions(image, { folder: `nyafie/uploads/${req.user._id}`, resource_type: "image", overwrite: false }));
  ok(res, { url: result.secure_url }, "Image uploaded", 201);
});

// Listing videos go straight from the browser to Cloudinary (too large for the API), with a one-time
// signature that fixes the folder, formats and compression (utils/listingMedia.js)
const videoLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, key: (req) => String(req.user._id), message: "Too many video uploads. Please wait a while and try again." });
// Videos only for verified (approved) agents and owners, or admins: applicants can still upload a photo
const canUploadVideo = (req) => !blocked(req.user) && (req.sessionDomain === "admin" || approvedAgent(req.user));
router.post("/video/signature", protectUpload, videoLimit, (req, res) => {
  if (!canUploadVideo(req)) return fail(res, 403, "Videos can be added once your account is verified.");
  res.set("Cache-Control", "no-store");
  ok(res, videoUploadParams(req.user._id));
});
// After the upload: what Cloudinary stored, checked against the limits (too large or long: deleted)
router.post("/video/verify", protectUpload, async (req, res) => {
  if (!canUploadVideo(req)) return fail(res, 403, "Videos can be added once your account is verified.");
  ok(res, await verifyVideo(req.body?.publicId, [req.user._id]), "Video ready");
});
export default router;
