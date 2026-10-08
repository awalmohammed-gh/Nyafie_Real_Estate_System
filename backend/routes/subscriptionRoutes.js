import { Router } from "express";
import { currentSubscription, initializePayment, verifyPayment, cancelSubscription } from "../controllers/subscriptionController.js";
import { protectSubscriber, protectAgent } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protectSubscriber);
router.get("/current", currentSubscription);
router.post("/initialize", initializePayment); // subscribe, renew and upgrade all start here
router.post("/verify", verifyPayment);
router.post("/cancel", protectAgent, cancelSubscription);

export default router;
