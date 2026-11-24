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
  setFeatured, confirmAvailability,
  deleteProperty,
  assignProperty,
} from "../controllers/propertyController.js";
import { listPropertyReviews, submitReview } from "../controllers/reviewController.js";
import { protectAgent, protectCustomer, protectOwner, optionalAuth, viewerSessions } from "../middleware/authMiddleware.js";
import { agentOnly, activeSubscription } from "../middleware/agentMiddleware.js";
import { hotelRooms, hotelQuote } from "../controllers/hotelController.js";
import { payoutBanks, getHotelPayout, connectHotelPayout, disconnectHotelPayout, cancelPayoutChange } from "../controllers/hotelPayoutController.js";
import { limits } from "../middleware/security.js";
import { listingInsights } from "../controllers/listingInsightsController.js";
import { addDocument, getDocuments, ownerDocumentLink, removeDocument, reopenDocuments, submitDocuments } from "../controllers/documentCheckController.js";

const router = Router();

router.get("/", optionalAuth, listPublicProperties); // search pages add ?page, limit, search, listingType, type, area, minPrice, maxPrice, bedrooms, sort...
router.get("/facets", propertyFacets);
router.get("/nearby", optionalAuth, nearbyProperties); // ?latitude, longitude, radius (km) + the search filters above; nearest first
router.get("/my", protectAgent, agentOnly, myProperties);
router.post("/", protectAgent, agentOnly, limits.listingSaves, activeSubscription, createProperty);
router.get("/payout-banks", protectAgent, agentOnly, payoutBanks); // ?type=bank|mobile_money (Paystack's Ghana list)
router.get("/:id", optionalAuth, getProperty);
router.get("/:id/related", optionalAuth, relatedProperties);
router.get("/:id/rooms", optionalAuth, hotelRooms);
router.post("/:id/rooms/quote", hotelQuote);
router.get("/:id/reviews", optionalAuth, listPropertyReviews); // ?page, limit, sort=newest|highest|lowest
router.post("/:id/reviews", protectCustomer, submitReview); // one review per customer: posting again updates it
router.post("/:id/view", viewerSessions, recordView); // details page only; the body is ignored
router.put("/:id", protectAgent, agentOnly, limits.listingSaves, activeSubscription, updateProperty);
// Where a hotel's online payments are settled (account owner only; changing it needs their password)
router.get("/:id/payout", protectAgent, agentOnly, getHotelPayout);
router.get("/:id/insights", protectOwner, listingInsights); // views per day, saves and leads (?days=14|30|90)
router.put("/:id/payout", protectAgent, agentOnly, limits.payout, connectHotelPayout); // checks the password, calls Paystack
router.delete("/:id/payout", protectAgent, agentOnly, disconnectHotelPayout);
router.delete("/:id/payout/pending", protectAgent, agentOnly, cancelPayoutChange); // cancel a change still on its security hold
router.patch("/:id/feature", protectAgent, agentOnly, activeSubscription, setFeatured);
// Ownership documents for a sale listing: private files NyaFie checks for the "Documents checked" badge
router.get("/:id/documents", protectAgent, agentOnly, getDocuments);
router.post("/:id/documents", protectAgent, agentOnly, limits.listingSaves, addDocument); // { kind, name, file }
router.post("/:id/documents/submit", protectAgent, agentOnly, submitDocuments);
router.post("/:id/documents/reopen", protectAgent, agentOnly, reopenDocuments);
router.delete("/:id/documents/:docId", protectAgent, agentOnly, removeDocument);
router.get("/:id/documents/:docId/link", protectAgent, agentOnly, ownerDocumentLink); // a link that expires
router.patch("/:id/confirm-availability", protectAgent, agentOnly, confirmAvailability); // listing freshness
router.patch("/:id/assign", protectAgent, agentOnly, assignProperty); // agency owner or manager
router.delete("/:id", protectAgent, deleteProperty);

export default router;
