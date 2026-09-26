import { Router } from "express";
import { dashboard, agentInquiries, agentUpdateInquiry } from "../controllers/agentController.js";
import { protect } from "../middleware/authMiddleware.js";
import { agentOnly } from "../middleware/agentMiddleware.js";
import { listConversations } from "../controllers/chatController.js";

const router = Router();

// Agents with an inactive subscription can still read their data (to renew)
router.use(protect, agentOnly);
router.get("/dashboard", dashboard);
router.get("/inquiries", agentInquiries);
router.patch("/inquiries/:id/status", agentUpdateInquiry);
router.get("/messages", listConversations("owner")); // chats about this agent own properties

export default router;
