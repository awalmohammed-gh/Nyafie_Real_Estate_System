import { Router } from "express";
import { financialInventory } from "../controllers/financialInventoryController.js";
import * as admin from "../controllers/adminController.js";
import { dashboard, performance, counts } from "../controllers/adminDashboardController.js";
import { adminListReviews, adminMarkReviewsSeen, adminSetReviewStatus, adminUnseenReviewCount } from "../controllers/reviewController.js";
import { deleteProperty } from "../controllers/propertyController.js";
import { listConversations } from "../controllers/chatController.js";
import { ownerOffers } from "../controllers/offerController.js";
import { ownerRentals } from "../controllers/rentalController.js";
import { ownerSaleRequests } from "../controllers/saleRequestController.js";
import { listPayments } from "../controllers/paymentController.js";
import { checkRefund, createRefund, listRefunds, settleRefund } from "../controllers/refundController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";
import { listApplications, reviewApplication } from "../controllers/agentApplicationController.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import { listContactMessages, setContactMessageStatus } from "../controllers/contactController.js";

const router = Router();

// Every admin endpoint requires a signed-in admin
router.use(protectAdmin, adminOnly);

router.get("/dashboard", dashboard); // the admin overview, aggregated in one request
router.get("/performance", performance); // Platform performance chart: ?months=3|6|12
router.get("/counts", counts); // sidebar badges (pending agent applications)
router.get("/inventory", financialInventory); // unified rental, hotel, sale and subscription ledger

router.get("/users", admin.listUsers);
router.get("/users/:id", admin.getUser);
router.put("/users/:id", admin.updateUser);
router.patch("/users/:id/status", admin.setUserStatus);
router.delete("/users/:id", admin.deleteUser);

router.get("/agents", admin.listAgents);
router.get("/agent-applications", listApplications);
router.patch("/agent-applications/:id", reviewApplication);
router.patch("/agents/:id/subscription", admin.manageSubscription);
router.get("/agents/:id/removal", admin.getRemovalImpact);
router.post("/agents/:id/remove", admin.removeAgent); // the normal action: deactivate, keep history
router.post("/agents/:id/restore", admin.restoreAgent);
router.get("/agents/:id/deletion", admin.getDeletionPlan);
router.delete("/agents/:id", admin.deleteAgentPermanently); // separate, high-risk: only after removal

router.get("/subscriptions", admin.listSubscriptions);

// Refunds of flagged payments: through Paystack, or recorded after returning the money another way
router.get("/refunds", listRefunds);
router.post("/refunds", createRefund);
router.post("/refunds/:id/check", checkRefund);
router.post("/refunds/:id/resolve", settleRefund);

router.get("/properties", admin.listProperties);
router.post("/properties", admin.createProperty);
router.put("/properties/:id", admin.updateProperty);
router.patch("/properties/:id/status", admin.setPropertyStatus);
router.patch("/properties/:id/feature", admin.setPropertyFeatured);
router.patch("/properties/:id/confirm-availability", admin.confirmPropertyAvailability); // listing freshness
router.delete("/properties/:id", deleteProperty);

router.get("/reviews", adminListReviews); // ?search (property title), rating, status, page
router.get("/reviews/unseen-count", adminUnseenReviewCount);
router.post("/reviews/mark-seen", adminMarkReviewsSeen);
router.patch("/reviews/:id/status", adminSetReviewStatus); // hide or restore; review text is never edited

router.get("/inquiries", admin.listInquiries);
router.patch("/inquiries/:id/status", admin.setInquiryStatus);
router.get("/contact-messages", listContactMessages);
router.patch("/contact-messages/:id/status", setContactMessageStatus);

router.get("/settings/payment-status", admin.getPaymentStatus);
router.put("/settings/:section", admin.updateSettings);
router.put("/account", admin.updateAccount); // password: PUT /api/auth/admin/me/password

router.get("/messages", listConversations("owner")); // chats about admin-owned properties

router.get("/offers", ownerOffers); // every offer on the platform
router.get("/rentals", ownerRentals);
router.get("/sale-requests", ownerSaleRequests);
router.get("/payments", listPayments);

export default router;
