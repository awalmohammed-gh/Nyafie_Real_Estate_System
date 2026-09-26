import { Router } from "express";
import { currentSubscription, initializePayment, verifyPayment, cancelSubscription } from "../controllers/subscriptionController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protect);
router.get("/current", currentSubscription);
router.post("/initialize", initializePayment); // subscribe, renew and upgrade all start here
router.post("/verify", verifyPayment);
router.post("/cancel", cancelSubscription);

export default router;
