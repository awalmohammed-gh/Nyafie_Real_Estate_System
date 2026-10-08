import { Router } from "express";
import {
  listConversations,
  getConversation,
  createConversation,
  sendMessage,
  markRead,
  closeConversation,
} from "../controllers/chatController.js";
import { protect, protectCustomer } from "../middleware/authMiddleware.js";

const router = Router();

// Every chat endpoint needs a signed-in account; access to each conversation is
// checked in the controller (customer, owning agent, or admin for admin listings)
router.use(protect);
router.get("/", listConversations());
router.post("/", protectCustomer, createConversation);
router.get("/:id", getConversation);
router.post("/:id/messages", sendMessage);
router.put("/:id/read", markRead);
router.put("/:id/close", closeConversation);

export default router;
