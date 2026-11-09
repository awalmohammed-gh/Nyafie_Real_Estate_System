import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import { ok, fail } from "../utils/response.js";

// The authenticated account's notifications. Identity always comes from the verified session (req.user),
// never from the request. Admins also see the shared notifications about NyaFie listings; like the
// read state, reading or deleting one of those applies to every admin.
const mine = (user) => (user.role === "admin" ? { $or: [{ recipient: user._id }, { audience: "admins" }] } : { recipient: user._id });
const MAX_BULK = 100;

// Latest notifications + unread count; deletes return it so every badge stays exact
const snapshot = async (user) => {
  const filter = mine(user);
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(30),
    Notification.countDocuments({ ...filter, read: false }),
  ]);
  return { items, unread };
};

// GET /api/notifications -> latest notifications + unread count
export const listNotifications = async (req, res) => {
  ok(res, await snapshot(req.user));
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

// PATCH /api/notifications/read { ids } -> mark the selected notifications as read
export const markSelectedNotificationsRead = async (req, res) => {
  const ids = selectedIds(req.body?.ids);
  if (!ids) return fail(res, 400, `Select between 1 and ${MAX_BULK} notifications.`);
  await Notification.updateMany({ _id: { $in: ids }, ...mine(req.user), read: false }, { read: true });
  ok(res, await snapshot(req.user));
};

// DELETE /api/notifications/:id -> delete one of your notifications
export const deleteNotification = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Notification not found.");
  const { deletedCount } = await Notification.deleteOne({ _id: req.params.id, ...mine(req.user) });
  if (!deletedCount) return fail(res, 404, "Notification not found.");
  ok(res, { deleted: 1, ...(await snapshot(req.user)) }, "Notification deleted");
};

// Unique, valid ids from the request body, or null when the selection is empty, invalid or too large
const selectedIds = (value) => {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map(String))];
  if (!ids.length || ids.length > MAX_BULK || !ids.every((id) => mongoose.isValidObjectId(id))) return null;
  return ids.map((id) => new mongoose.Types.ObjectId(id));
};

// POST /api/notifications/delete { ids } -> delete the selected notifications.
// All or nothing: if any id isn't one of this account's notifications, nothing is deleted.
export const deleteSelectedNotifications = async (req, res) => {
  const ids = selectedIds(req.body?.ids);
  if (!ids) return fail(res, 400, `Select between 1 and ${MAX_BULK} notifications.`);
  const filter = { _id: { $in: ids }, ...mine(req.user) };
  if ((await Notification.countDocuments(filter)) !== ids.length) return fail(res, 404, "Some of these notifications could not be found.");
  const { deletedCount } = await Notification.deleteMany(filter);
  ok(res, { deleted: deletedCount, ...(await snapshot(req.user)) }, `${deletedCount} ${deletedCount === 1 ? "notification" : "notifications"} deleted`);
};

// DELETE /api/notifications -> delete every notification of this account
export const deleteAllNotifications = async (req, res) => {
  const { deletedCount } = await Notification.deleteMany(mine(req.user));
  ok(res, { deleted: deletedCount, items: [], unread: 0 }, "All notifications deleted");
};
