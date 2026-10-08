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
import { listPropertyReviews, submitReview } from "../controllers/reviewController.js";
import { protectAgent, protectCustomer, optionalAuth } from "../middleware/authMiddleware.js";
import { agentOnly, activeSubscription } from "../middleware/agentMiddleware.js";

const router = Router();

router.get("/", listPublicProperties); // search pages add ?page, limit, search, listingType, type, area, minPrice, maxPrice, bedrooms, sort...
router.get("/facets", propertyFacets);
router.get("/my", protectAgent, agentOnly, myProperties);
router.post("/", protectAgent, agentOnly, activeSubscription, createProperty);
router.get("/:id", optionalAuth, getProperty);
router.get("/:id/related", relatedProperties);
router.get("/:id/reviews", optionalAuth, listPropertyReviews); // ?page, limit, sort=newest|highest|lowest
router.post("/:id/reviews", protectCustomer, submitReview); // one review per customer: posting again updates it
router.post("/:id/view", optionalAuth, recordView);
router.put("/:id", protectAgent, agentOnly, activeSubscription, updateProperty);
router.patch("/:id/feature", protectAgent, agentOnly, activeSubscription, setFeatured);
router.delete("/:id", protectAgent, deleteProperty);

export default router;
