import { Router } from "express";
import { createRental, myRentals, getRental, updateRentalStatus } from "../controllers/rentalController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

// Renting always needs a signed-in account (401 otherwise)
router.use(protect);
router.post("/", createRental);
router.get("/my", myRentals);
router.get("/:id", getRental);
router.patch("/:id/status", updateRentalStatus);

export default router;
