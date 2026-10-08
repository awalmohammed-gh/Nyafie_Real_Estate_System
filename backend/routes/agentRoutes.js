import { Router } from "express";
import { dashboard, agentInquiries, agentUpdateInquiry } from "../controllers/agentController.js";
import { protectAgent, protectAgentSession } from "../middleware/authMiddleware.js";
import { getApplication, saveApplication, submitApplication, updateAgentProfile } from "../controllers/agentApplicationController.js";
import { agentOnly } from "../middleware/agentMiddleware.js";
import { listConversations } from "../controllers/chatController.js";
import { ownerOffers } from "../controllers/offerController.js";
import { ownerRentals } from "../controllers/rentalController.js";
import { ownerSaleRequests } from "../controllers/saleRequestController.js";
import { listPublicAgents } from "../controllers/propertyController.js";

const router = Router();

// Public: the agents directory customers see (declared before the agent-only guard below)
router.get("/public", listPublicAgents);
router.get("/application", protectAgentSession, getApplication);
router.put("/application", protectAgentSession, saveApplication);
router.post("/application/submit", protectAgentSession, submitApplication);

// Agents with an inactive subscription can still read their data (to renew)
router.use(protectAgent, agentOnly);
router.put("/profile", updateAgentProfile);
router.get("/dashboard", dashboard);
router.get("/inquiries", agentInquiries);
router.patch("/inquiries/:id/status", agentUpdateInquiry);
router.get("/messages", listConversations("owner")); // chats about this agent own properties
router.get("/offers", ownerOffers); // only offers on this agent's own properties
router.get("/rentals", ownerRentals);
router.get("/sale-requests", ownerSaleRequests);

export default router;
