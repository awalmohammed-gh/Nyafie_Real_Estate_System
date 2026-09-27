import { Router } from "express";
import { initializeRentalPayment, verifyPayment } from "../controllers/paymentController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

// Rental payments: the Paystack secret key is only ever used here, on the server
router.use(protect);
router.post("/initialize", initializeRentalPayment);
router.get("/verify/:reference", verifyPayment);

export default router;
