import { Router } from "express";
import { listPlans, createPlan, updatePlan, deletePlan } from "../controllers/planController.js";
import { protect, optionalAuth } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";

const router = Router();

router.get("/", optionalAuth, listPlans);
router.post("/", protect, adminOnly, createPlan);
router.put("/:id", protect, adminOnly, updatePlan);
router.delete("/:id", protect, adminOnly, deletePlan);

export default router;
