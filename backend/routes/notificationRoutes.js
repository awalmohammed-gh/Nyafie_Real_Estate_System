import { Router } from "express";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "../controllers/notificationController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

// Each account only ever sees its own notifications (plus shared admin ones for admins)
router.use(protect);
router.get("/", listNotifications);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);

export default router;
