import { Router } from "express";
import { createRental, myRentals, getRental, updateRentalStatus, recordArrivalPayment, sendRentalReceipt, cancelMyReservation, updateArrivalTime, approveStayBooking } from "../controllers/rentalController.js";
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
// Monthly and fixed-price rentals: the tenant paid at the office (the receipt is sent with it)
router.patch("/:id/paid-at-office", protectOwner, recordArrivalPayment);
// Hotel bookings paid online into the hotel's account: the hotel sends the guest's receipt
router.post("/:id/receipt", protectOwner, sendRentalReceipt);
// Stays: the hotel (assigning the guest's rooms) or owner approves a booking; the booking receipt is sent with it
router.patch("/:id/approve", protectOwner, approveStayBooking);
router.patch("/:id/cancel", protectCustomer, cancelMyReservation);
// Stays: the guest changes when they'll arrive (the hotel or owner is told)
router.patch("/:id/arrival", protectCustomer, updateArrivalTime);

export default router;
