import { Router } from "express";
import { getSettings } from "../models/Setting.js";
import { ok } from "../utils/response.js";

const router = Router();

// Platform settings contain no secrets, so the frontend can read them.
// contact.whatsapp is the public number used for HomeBase (admin) listings.
router.get("/", async (_req, res) => {
  const settings = await getSettings();
  ok(res, { ...settings, contact: { whatsapp: process.env.ADMIN_WHATSAPP_NUMBER || settings.platform.phone } });
});

export default router;
