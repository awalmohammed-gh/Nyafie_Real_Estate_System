import { Router } from "express";
import { protectUpload } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/security.js";
import { cloudinary } from "../config/cloudinary.js";
import { fail, ok } from "../utils/response.js";

const router = Router();
router.post("/image", protectUpload, rateLimit({ windowMs: 15 * 60 * 1000, max: 60, key: (req) => String(req.user._id) }), async (req, res) => {
  if (!req.user.isActive || (req.user.role === "agent" && req.user.agentApplication?.status === "suspended")) return fail(res, 403, "Your account cannot upload images.");
  const image = req.body.image;
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp|gif|svg\+xml);base64,[a-z\d+/]+={0,2}$/i.test(image)) return fail(res, 400, "Choose a supported image.");
  if (Buffer.byteLength(image, "utf8") > 3 * 1024 * 1024) return fail(res, 413, "This image is too large. Choose a smaller image.");
  const result = await cloudinary.uploader.upload(image, { folder: `homebase/uploads/${req.user._id}`, resource_type: "image", overwrite: false });
  ok(res, { url: result.secure_url }, "Image uploaded", 201);
});
export default router;
