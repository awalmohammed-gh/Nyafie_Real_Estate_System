import { Router } from "express";
import { listPlans, createPlan, updatePlan, deletePlan } from "../controllers/planController.js";
import { protectAdmin, optionalAuth } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";

const router = Router();

router.get("/", optionalAuth, listPlans);
router.post("/", protectAdmin, adminOnly, createPlan);
router.put("/:id", protectAdmin, adminOnly, updatePlan);
router.delete("/:id", protectAdmin, adminOnly, deletePlan);

export default router;
