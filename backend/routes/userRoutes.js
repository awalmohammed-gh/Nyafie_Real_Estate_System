import { Router } from "express";
import { getSaved, toggleSaved } from "../controllers/userController.js";
import { myInquiries } from "../controllers/inquiryController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protect);
router.get("/saved", getSaved);
router.post("/saved/:propertyId", toggleSaved);
router.get("/inquiries", myInquiries);

export default router;
