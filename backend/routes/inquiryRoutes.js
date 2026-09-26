import { Router } from "express";
import { createInquiry } from "../controllers/inquiryController.js";
import { optionalAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/", optionalAuth, createInquiry);

export default router;
