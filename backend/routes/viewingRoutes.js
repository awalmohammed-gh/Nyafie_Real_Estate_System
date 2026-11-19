import { Router } from "express";
import { createViewing, getViewing, myViewings, updateViewing } from "../controllers/viewingController.js";
import { protect, protectCustomer } from "../middleware/authMiddleware.js";

const router = Router();

// Every viewing endpoint needs a signed-in account; who may see or change each viewing (its
// customer, the owning agent or agency staff, or an admin) is checked in the controller.
// Owners list theirs at /api/agents/viewings and /api/admin/viewings.
router.use(protect);
router.post("/", protectCustomer, createViewing);
router.get("/my", protectCustomer, myViewings);
router.get("/:id", getViewing);
router.patch("/:id", updateViewing);

export default router;
