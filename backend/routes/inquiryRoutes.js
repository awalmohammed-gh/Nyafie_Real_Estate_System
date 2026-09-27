import { Router } from "express";
import { createInquiry } from "../controllers/inquiryController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/", protect, createInquiry); // customers must sign in to contact owners

export default router;
