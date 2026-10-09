import { Router } from "express";
import { viewInvite, acceptInvite } from "../controllers/teamController.js";
import { protectAgentSession } from "../middleware/authMiddleware.js";

const router = Router();

// Agency invite links: anyone with the link sees which agency sent it; joining needs an agent session
router.get("/invites/:token", viewInvite);
router.post("/invites/:token/accept", protectAgentSession, acceptInvite);

export default router;
