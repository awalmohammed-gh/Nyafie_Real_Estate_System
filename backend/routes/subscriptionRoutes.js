import { Router } from "express";
import { currentSubscription, listUpgrades, quoteSubscription, initializePayment, upgradeSubscription, verifyPayment, cancelSubscription } from "../controllers/subscriptionController.js";
import { protectSubscriber, protectAgent } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protectSubscriber);
router.get("/current", currentSubscription);
router.get("/upgrades", listUpgrades); // higher plans of the provider's own account type, with today's price
router.post("/quote", quoteSubscription); // what a plan costs now, including credit for the current plan
router.post("/initialize", initializePayment); // subscribe, renew and upgrade all start here
router.post("/upgrade", upgradeSubscription); // the same, but only for a higher plan
router.post("/verify", verifyPayment);
router.post("/cancel", protectAgent, cancelSubscription);

export default router;
