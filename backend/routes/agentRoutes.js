import { Router } from "express";
import { dashboard, agentInquiries, agentUpdateInquiry } from "../controllers/agentController.js";
import { protect } from "../middleware/authMiddleware.js";
import { agentOnly } from "../middleware/agentMiddleware.js";
import { listConversations } from "../controllers/chatController.js";
import { ownerOffers } from "../controllers/offerController.js";
import { ownerRentals } from "../controllers/rentalController.js";
import { ownerSaleRequests } from "../controllers/saleRequestController.js";
import { listPublicAgents } from "../controllers/propertyController.js";

const router = Router();

// Public: the agents directory customers see (declared before the agent-only guard below)
router.get("/public", listPublicAgents);

// Agents with an inactive subscription can still read their data (to renew)
router.use(protect, agentOnly);
router.get("/dashboard", dashboard);
router.get("/inquiries", agentInquiries);
router.patch("/inquiries/:id/status", agentUpdateInquiry);
router.get("/messages", listConversations("owner")); // chats about this agent own properties
router.get("/offers", ownerOffers); // only offers on this agent's own properties
router.get("/rentals", ownerRentals);
router.get("/sale-requests", ownerSaleRequests);

export default router;
