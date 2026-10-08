import { Router } from "express";
import {
  createSaleRequest,
  mySaleRequests,
  getSaleRequest,
  updateSaleStatus,
  confirmOfficePayment,
  completeSale,
  cancelSaleRequest,
} from "../controllers/saleRequestController.js";
import { protect, protectCustomer, protectOwner } from "../middleware/authMiddleware.js";

const router = Router();

// Signed-in accounts only; the controller checks the customer or the property owner (agent/admin)
router.use(protect);
router.post("/", protectCustomer, createSaleRequest);
router.get("/my", protectCustomer, mySaleRequests);
router.get("/:id", getSaleRequest);
router.patch("/:id/status", protectOwner, updateSaleStatus);
router.patch("/:id/confirm-payment", protectOwner, confirmOfficePayment);
router.patch("/:id/complete", protectOwner, completeSale);
router.patch("/:id/cancel", protectCustomer, cancelSaleRequest);

export default router;
