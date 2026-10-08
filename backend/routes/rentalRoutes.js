import { Router } from "express";
import { createRental, myRentals, getRental, updateRentalStatus } from "../controllers/rentalController.js";
import { protect, protectCustomer, protectOwner } from "../middleware/authMiddleware.js";

const router = Router();

// Renting always needs a signed-in account (401 otherwise)
router.use(protect);
router.post("/", protectCustomer, createRental);
router.get("/my", protectCustomer, myRentals);
router.get("/:id", getRental);
router.patch("/:id/status", protectOwner, updateRentalStatus);

export default router;
