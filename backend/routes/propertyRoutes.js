import { Router } from "express";
import {
  listPublicProperties,
  propertyFacets,
  nearbyProperties,
  relatedProperties,
  getProperty,
  recordView,
  myProperties,
  createProperty,
  updateProperty,
  setFeatured,
  deleteProperty,
  assignProperty,
} from "../controllers/propertyController.js";
import { listPropertyReviews, submitReview } from "../controllers/reviewController.js";
import { protectAgent, protectCustomer, optionalAuth, viewerSessions } from "../middleware/authMiddleware.js";
import { agentOnly, activeSubscription } from "../middleware/agentMiddleware.js";
import { hotelRooms, hotelQuote } from "../controllers/hotelController.js";

const router = Router();

router.get("/", optionalAuth, listPublicProperties); // search pages add ?page, limit, search, listingType, type, area, minPrice, maxPrice, bedrooms, sort...
router.get("/facets", propertyFacets);
router.get("/nearby", optionalAuth, nearbyProperties); // ?latitude, longitude, radius (km) + the search filters above; nearest first
router.get("/my", protectAgent, agentOnly, myProperties);
router.post("/", protectAgent, agentOnly, activeSubscription, createProperty);
router.get("/:id", optionalAuth, getProperty);
router.get("/:id/related", optionalAuth, relatedProperties);
router.get("/:id/rooms", optionalAuth, hotelRooms);
router.post("/:id/rooms/quote", hotelQuote);
router.get("/:id/reviews", optionalAuth, listPropertyReviews); // ?page, limit, sort=newest|highest|lowest
router.post("/:id/reviews", protectCustomer, submitReview); // one review per customer: posting again updates it
router.post("/:id/view", viewerSessions, recordView); // details page only; the body is ignored
router.put("/:id", protectAgent, agentOnly, activeSubscription, updateProperty);
router.patch("/:id/feature", protectAgent, agentOnly, activeSubscription, setFeatured);
router.patch("/:id/assign", protectAgent, agentOnly, assignProperty); // agency owner or manager
router.delete("/:id", protectAgent, deleteProperty);

export default router;
