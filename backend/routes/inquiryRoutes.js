import { Router } from "express";
import { createInquiry } from "../controllers/inquiryController.js";
import { protectCustomer } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/", protectCustomer, createInquiry); // customers must sign in to contact owners

export default router;
