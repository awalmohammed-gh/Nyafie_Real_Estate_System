import { Router } from "express";
import { createRental, myRentals, getRental, updateRentalStatus, recordArrivalPayment, cancelMyReservation } from "../controllers/rentalController.js";
import { reserveOnArrival } from "../controllers/hotelPaymentController.js";
import { protect, protectCustomer, protectOwner } from "../middleware/authMiddleware.js";

const router = Router();

// Renting always needs a signed-in account (401 otherwise)
router.use(protect);
router.post("/", protectCustomer, createRental);
router.get("/my", protectCustomer, myRentals);
router.get("/:id", getRental);
router.patch("/:id/status", protectOwner, updateRentalStatus);
// Hotels: "reserve now, pay at the hotel", the hotel recording that payment, and guest cancellation
router.post("/:id/reserve", protectCustomer, reserveOnArrival);
router.patch("/:id/paid-on-arrival", protectOwner, recordArrivalPayment);
router.patch("/:id/cancel", protectCustomer, cancelMyReservation);

export default router;
