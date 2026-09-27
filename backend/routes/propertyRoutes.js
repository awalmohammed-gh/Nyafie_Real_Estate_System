import { Router } from "express";
import {
  listPublicProperties,
  propertyFacets,
  relatedProperties,
  getProperty,
  recordView,
  myProperties,
  createProperty,
  updateProperty,
  setFeatured,
  deleteProperty,
} from "../controllers/propertyController.js";
import { protect, optionalAuth } from "../middleware/authMiddleware.js";
import { agentOnly, activeSubscription } from "../middleware/agentMiddleware.js";

const router = Router();

router.get("/", listPublicProperties); // search pages add ?page, limit, search, listingType, type, area, minPrice, maxPrice, bedrooms, sort...
router.get("/facets", propertyFacets);
router.get("/my", protect, agentOnly, myProperties);
router.post("/", protect, agentOnly, activeSubscription, createProperty);
router.get("/:id", optionalAuth, getProperty);
router.get("/:id/related", relatedProperties);
router.post("/:id/view", optionalAuth, recordView);
router.put("/:id", protect, agentOnly, activeSubscription, updateProperty);
router.patch("/:id/feature", protect, agentOnly, activeSubscription, setFeatured);
router.delete("/:id", protect, deleteProperty);

export default router;
