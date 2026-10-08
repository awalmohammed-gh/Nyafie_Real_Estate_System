import { Router } from "express";
import { createContactMessage } from "../controllers/contactController.js";
import { rateLimit } from "../middleware/security.js";

const router = Router();
router.post("/", rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: "You've sent several messages. Please wait 15 minutes before trying again." }), createContactMessage);
export default router;
