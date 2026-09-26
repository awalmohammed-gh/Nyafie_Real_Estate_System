import { Router } from "express";
import * as admin from "../controllers/adminController.js";
import { deleteProperty } from "../controllers/propertyController.js";
import { listConversations } from "../controllers/chatController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";

const router = Router();

// Every admin endpoint requires a signed-in admin
router.use(protect, adminOnly);

router.get("/dashboard", admin.dashboard);

router.get("/users", admin.listUsers);
router.get("/users/:id", admin.getUser);
router.put("/users/:id", admin.updateUser);
router.patch("/users/:id/status", admin.setUserStatus);
router.delete("/users/:id", admin.deleteUser);

router.get("/agents", admin.listAgents);
router.patch("/agents/:id/subscription", admin.manageSubscription);

router.get("/subscriptions", admin.listSubscriptions);

router.get("/properties", admin.listProperties);
router.post("/properties", admin.createProperty);
router.put("/properties/:id", admin.updateProperty);
router.patch("/properties/:id/status", admin.setPropertyStatus);
router.patch("/properties/:id/feature", admin.setPropertyFeatured);
router.delete("/properties/:id", deleteProperty);

router.get("/inquiries", admin.listInquiries);
router.patch("/inquiries/:id/status", admin.setInquiryStatus);

router.put("/settings/:section", admin.updateSettings);

router.get("/messages", listConversations("owner")); // chats about admin-owned properties

export default router;
