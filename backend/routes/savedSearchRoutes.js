import { Router } from "express";
import { createSavedSearch, deleteSavedSearch, listSavedSearches, updateSavedSearch } from "../controllers/savedSearchController.js";
import { protectCustomer } from "../middleware/authMiddleware.js";

// A customer's saved searches and their new-listing alerts
const router = Router();
router.use(protectCustomer);
router.get("/", listSavedSearches);
router.post("/", createSavedSearch);
router.patch("/:id", updateSavedSearch);
router.delete("/:id", deleteSavedSearch);

export default router;
