import { Router } from "express";
import { createOffer, myOffers, getOffer, respondToOffer, withdrawOffer } from "../controllers/offerController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

// Every offer endpoint needs a signed-in account; who may see or change each
// offer (its customer, the owning agent, or an admin) is checked in the controller
router.use(protect);
router.post("/", createOffer);
router.get("/my", myOffers);
router.get("/:id", getOffer);
router.patch("/:id/respond", respondToOffer);
router.patch("/:id/withdraw", withdrawOffer);

export default router;
