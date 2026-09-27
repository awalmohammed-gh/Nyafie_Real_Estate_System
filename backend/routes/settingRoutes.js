import { Router } from "express";
import { getSettings } from "../models/Setting.js";
import { ok } from "../utils/response.js";

const router = Router();

// Public: branding, contact details, URL slugs and listing options drive the whole website.
// Nothing secret lives in the settings document (keys stay in backend/.env).
// Changes go through PUT /api/admin/settings/:section, which requires an admin session.
router.get("/", async (_req, res) => {
  ok(res, await getSettings());
});

export default router;
