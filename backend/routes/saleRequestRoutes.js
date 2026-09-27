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
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

// Signed-in accounts only; the controller checks the customer or the property owner (agent/admin)
router.use(protect);
router.post("/", createSaleRequest);
router.get("/my", mySaleRequests);
router.get("/:id", getSaleRequest);
router.patch("/:id/status", updateSaleStatus);
router.patch("/:id/confirm-payment", confirmOfficePayment);
router.patch("/:id/complete", completeSale);
router.patch("/:id/cancel", cancelSaleRequest);

export default router;
