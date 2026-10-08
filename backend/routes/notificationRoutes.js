import { Router } from "express";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markSelectedNotificationsRead,
  deleteNotification,
  deleteSelectedNotifications,
  deleteAllNotifications,
} from "../controllers/notificationController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

// Each account only ever sees and changes its own notifications (plus shared admin ones for admins)
router.use(protect);
router.get("/", listNotifications);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/read", markSelectedNotificationsRead); // { ids }
router.patch("/:id/read", markNotificationRead);
router.post("/delete", deleteSelectedNotifications); // { ids }
router.delete("/", deleteAllNotifications);
router.delete("/:id", deleteNotification);

export default router;
