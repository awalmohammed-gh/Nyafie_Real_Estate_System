import { Router } from "express";
import * as admin from "../controllers/adminController.js";
import { deleteProperty } from "../controllers/propertyController.js";
import { listConversations } from "../controllers/chatController.js";
import { ownerOffers } from "../controllers/offerController.js";
import { ownerRentals } from "../controllers/rentalController.js";
import { ownerSaleRequests } from "../controllers/saleRequestController.js";
import { listPayments } from "../controllers/paymentController.js";
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

router.get("/settings/payment-status", admin.getPaymentStatus);
router.put("/settings/:section", admin.updateSettings);
router.put("/account", admin.updateAccount); // the signed-in admin's own details (password: PUT /api/auth/me/password)

router.get("/messages", listConversations("owner")); // chats about admin-owned properties

router.get("/offers", ownerOffers); // every offer on the platform
router.get("/rentals", ownerRentals);
router.get("/sale-requests", ownerSaleRequests);
router.get("/payments", listPayments);

export default router;
