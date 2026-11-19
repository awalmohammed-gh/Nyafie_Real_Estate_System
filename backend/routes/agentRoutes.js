import { Router } from "express";
import { dashboard, agentInquiries, agentUpdateInquiry, assignInquiry } from "../controllers/agentController.js";
import { listTeam, createInvite, revokeInvite, updateMember, removeMember, teamOwnerOnly } from "../controllers/teamController.js";
import { protect, protectAgent, protectAgentSession } from "../middleware/authMiddleware.js";
import { getApplication, saveApplication, submitApplication, updateAgentProfile } from "../controllers/agentApplicationController.js";
import { agentOnly } from "../middleware/agentMiddleware.js";
import { limits } from "../middleware/security.js";
import { listConversations } from "../controllers/chatController.js";
import { ownerOffers } from "../controllers/offerController.js";
import { ownerRentals } from "../controllers/rentalController.js";
import { ownerSaleRequests } from "../controllers/saleRequestController.js";
import { ownerViewings } from "../controllers/viewingController.js";
import { listPublicAgents } from "../controllers/propertyController.js";

const router = Router();

// Directory profiles require a signed-in session; agent workspace guards follow below.
router.get("/public", protect, listPublicAgents);
router.get("/application", protectAgentSession, getApplication);
router.put("/application", protectAgentSession, limits.listingSaves, saveApplication);
router.post("/application/submit", protectAgentSession, submitApplication);

// Agents with an inactive subscription can still read their data (to renew)
router.use(protectAgent, agentOnly);
router.put("/profile", limits.listingSaves, updateAgentProfile);
router.get("/dashboard", dashboard);
router.get("/inquiries", agentInquiries);
router.patch("/inquiries/:id/status", agentUpdateInquiry);
router.patch("/inquiries/:id/assign", assignInquiry); // agency owner or manager

// Agency team: owners and managers see it; only the owner invites, changes roles and removes members
router.get("/team", listTeam);
router.post("/team/invites", teamOwnerOnly, createInvite);
router.delete("/team/invites/:id", teamOwnerOnly, revokeInvite);
router.patch("/team/members/:id", teamOwnerOnly, updateMember);
router.delete("/team/members/:id", teamOwnerOnly, removeMember);
router.get("/messages", listConversations("owner")); // chats about this agent own properties
router.get("/offers", ownerOffers); // only offers on this agent's own properties
router.get("/rentals", ownerRentals);
router.get("/sale-requests", ownerSaleRequests);
router.get("/viewings", ownerViewings); // viewings booked on this agent's (or agency's) listings

export default router;
