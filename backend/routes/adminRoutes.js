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
import { ownerViewings } from "../controllers/viewingController.js";
import { listReports, reviewReport } from "../controllers/safetyReportController.js";
import { adminDocumentLink, listDocumentChecks, reviewDocumentCheck } from "../controllers/documentCheckController.js";
import { listPayments } from "../controllers/paymentController.js";
import { checkRefund, createRefund, listRefunds, settleRefund } from "../controllers/refundController.js";
import { getAdminProperty, getCustomer, listCustomers, pagePayments, pageProperties } from "../controllers/adminListController.js";
import { getProvider, listProviders, pageInquiries, planSummary, reportData } from "../controllers/adminProviderController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";
import { listApplications, reviewApplication } from "../controllers/agentApplicationController.js";
import { adminAgentProofs, agentProofLink } from "../controllers/agentProofController.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import { limits } from "../middleware/security.js";
import { listContactMessages, setContactMessageStatus } from "../controllers/contactController.js";

const router = Router();

// Every admin endpoint requires a signed-in admin
router.use(protectAdmin, adminOnly);

router.get("/dashboard", dashboard); // the admin overview, aggregated in one request
router.get("/performance", performance); // Platform performance chart: ?months=3|6|12
router.get("/counts", counts); // sidebar badges (pending agent applications)
router.get("/inventory", financialInventory); // unified rental, hotel, sale and subscription ledger

// Lists that can grow without limit come a page at a time (?page=1...). Without ?page, properties and
// payments return everything, for the reports and the pages that still need whole lists.
const paged = (page, whole) => (req, res) => (req.query.page === undefined ? whole : page)(req, res);
router.get("/customers", listCustomers);
router.get("/customers/:id", getCustomer);

router.get("/providers", listProviders); // agents, their plans and usage
router.get("/providers/:id", getProvider);
router.get("/plan-summary", planSummary);
router.get("/report-data", reportData);

router.get("/users", admin.listUsers);
router.get("/users/:id", admin.getUser);
router.put("/users/:id", admin.updateUser);
router.patch("/users/:id/status", admin.setUserStatus);
router.post("/users/:id/sign-out", admin.signOutUser); // everywhere
router.delete("/users/:id", admin.deleteUser);

router.get("/agents", admin.listAgents);
router.get("/agent-applications", listApplications);
router.patch("/agent-applications/:id", reviewApplication);
router.get("/agent-applications/:agentId/documents", adminAgentProofs);
router.get("/agent-applications/:agentId/documents/:docId/link", agentProofLink);
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

router.get("/properties", paged(pageProperties, admin.listProperties));
router.get("/properties/:id", getAdminProperty);
router.post("/properties", limits.listingSaves, admin.createProperty);
router.put("/properties/:id", limits.listingSaves, admin.updateProperty);
router.patch("/properties/:id/status", admin.setPropertyStatus);
router.patch("/properties/:id/feature", admin.setPropertyFeatured);
router.patch("/properties/:id/confirm-availability", admin.confirmPropertyAvailability); // listing freshness
router.delete("/properties/:id", deleteProperty);

router.get("/reviews", adminListReviews); // ?search (property title), rating, status, page
router.get("/reviews/unseen-count", adminUnseenReviewCount);
router.post("/reviews/mark-seen", adminMarkReviewsSeen);
router.patch("/reviews/:id/status", adminSetReviewStatus); // hide or restore; review text is never edited

router.get("/inquiries", paged(pageInquiries, admin.listInquiries));
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
router.get("/viewings", ownerViewings); // every viewing on the platform
router.get("/reports", listReports); // safety reports about listings and agents: ?status=open|resolved|dismissed|all
router.patch("/reports/:id", reviewReport);
router.get("/document-checks", listDocumentChecks); // ?status=pending|verified|rejected|all
router.get("/document-checks/:id/documents/:docId/link", adminDocumentLink); // a link that expires
router.patch("/document-checks/:id", reviewDocumentCheck);
router.get("/payments", paged(pagePayments, listPayments));

export default router;
