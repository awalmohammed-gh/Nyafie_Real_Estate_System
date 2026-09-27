import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import { ok, fail } from "../utils/response.js";

// Admins also see the shared notifications about HomeBase listings
const mine = (user) => (user.role === "admin" ? { $or: [{ recipient: user._id }, { audience: "admins" }] } : { recipient: user._id });

// GET /api/notifications -> latest notifications + unread count
export const listNotifications = async (req, res) => {
  const filter = mine(req.user);
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(30),
    Notification.countDocuments({ ...filter, read: false }),
  ]);
  ok(res, { items, unread });
};

// PATCH /api/notifications/:id/read
export const markNotificationRead = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Notification not found.");
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, ...mine(req.user) }, { read: true }, { returnDocument: "after" });
  if (!notification) return fail(res, 404, "Notification not found.");
  ok(res, notification);
};

// PATCH /api/notifications/read-all
export const markAllNotificationsRead = async (req, res) => {
  await Notification.updateMany({ ...mine(req.user), read: false }, { read: true });
  ok(res, null, "All caught up");
};
