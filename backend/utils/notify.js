import Notification from "../models/Notification.js";
import { getSettings } from "../models/Setting.js";

// Notification type -> the Admin Settings switch that controls it for the admin team
const ADMIN_SWITCH = { user: "newUsers", review: "propertyReviews", offer: "offers", rental: "rentals", sale: "sales", payment: "payments", message: "messages" };

/**
 * Creates an in-app notification. With a `key`, an existing unread notification
 * with the same key is refreshed instead (so ten chat messages show as one).
 * Notifications never block the action that triggered them.
 */
const save = async (target, { type, title, message = "", link = "", key }) => {
  try {
    const doc = { ...target, type, title, message: message.slice(0, 300), link, read: false };
    if (key) {
      await Notification.findOneAndUpdate({ ...target, key, read: false }, { ...doc, key, createdAt: new Date() }, { upsert: true, timestamps: false });
    } else {
      await Notification.create(doc);
    }
  } catch (error) {
    console.error("Notification failed:", error.message);
  }
};

// A specific account (customer or agent)
export const notifyUser = (userId, payload) => save({ recipient: userId, audience: "user" }, payload);

/**
 * The owner side of a listing record (offer, rental, sale request, conversation):
 * the agent who posted the property, or every admin for HomeBase listings.
 * `path` is the dashboard page, e.g. "offers" -> /agent/offers or /admin/offers.
 */
export const notifyOwner = (record, { path = "", ...payload }) => {
  const link = `/${record.ownerType === "admin" ? "admin" : "agent"}/${path}`;
  return record.ownerType === "admin" ? notifyAdmins({ ...payload, link }) : notifyUser(record.owner?._id || record.owner, { ...payload, link });
};

/**
 * The shared admin bell. Each type can be switched off in Admin Settings > Notifications;
 * `critical` ones (payment problems that need a refund or review) are always delivered.
 */
export const notifyAdmins = async ({ critical = false, ...payload }) => {
  try {
    const key = ADMIN_SWITCH[payload.type];
    if (!critical && key && (await getSettings()).notifications[key] === false) return;
  } catch (error) {
    console.error("Notification settings unavailable:", error.message);
  }
  return save({ recipient: null, audience: "admins" }, payload);
};
