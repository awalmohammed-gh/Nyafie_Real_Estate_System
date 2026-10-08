import { Router } from "express";
import { initializeRentalPayment, verifyPayment } from "../controllers/paymentController.js";
import { protectCustomer } from "../middleware/authMiddleware.js";

const router = Router();

// Rental payments: the Paystack secret key is only ever used here, on the server
router.use(protectCustomer);
router.post("/initialize", initializeRentalPayment);
router.get("/verify/:reference", verifyPayment);

export default router;
