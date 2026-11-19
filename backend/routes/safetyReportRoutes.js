import { Router } from "express";
import { createReport } from "../controllers/safetyReportController.js";
import { protect } from "../middleware/authMiddleware.js";

// Signed-in customers and agents report listings or agents; admins review them at /api/admin/reports
const router = Router();
router.post("/", protect, createReport);

export default router;
