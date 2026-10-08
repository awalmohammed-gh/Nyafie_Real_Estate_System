import { Router } from "express";
import { deleteReview, updateReview } from "../controllers/reviewController.js";
import { protectCustomer } from "../middleware/authMiddleware.js";

// A customer's own review (the author is always the signed-in account, never a client-sent id)
const router = Router();

router.patch("/:id", protectCustomer, updateReview);
router.delete("/:id", protectCustomer, deleteReview);

export default router;
