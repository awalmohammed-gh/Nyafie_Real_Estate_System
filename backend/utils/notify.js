import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { getSettings } from "../models/Setting.js";

// Notification type -> the Admin Settings switch that controls it for the admin team
const ADMIN_SWITCH = { user: "newUsers", review: "propertyReviews", customer_review: "customerReviews", offer: "offers", rental: "rentals", sale: "sales", payment: "payments", message: "messages" };
const CUSTOMER_SWITCH = { message: "inquiryUpdates", offer: "offerUpdates" };

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
export const notifyUser = async (userId, payload) => {
  const preference = CUSTOMER_SWITCH[payload.type];
  if (preference) {
    try {
      const user = await User.findById(userId).select("role preferences").lean();
      if (user?.role === "user" && user.preferences?.[preference] === false) return;
    } catch (error) {
      // A preference lookup failure must not interrupt the underlying transaction.
      console.error("Notification preferences unavailable:", error.message);
    }
  }
  return save({ recipient: userId, audience: "user" }, payload);
};

/**
 * The owner side of a listing record (offer, rental, sale request, conversation):
 * the agent who posted the property, or every admin for NyaFie listings.
 * `path` is the dashboard page, e.g. "offers" -> /agent/offers or /admin/offers.
 */
export const notifyOwner = (record, { path = "", ...payload }) => {
  const link = `/${record.ownerType === "admin" ? "admin" : "agent"}/${path}`;
  if (record.ownerType === "admin") return notifyAdmins({ ...payload, link });
  // Agency listings: the owner and the staff member assigned to the listing both hear about it
  const owner = String(record.owner?._id || record.owner);
  const assignee = record.assignedTo ? String(record.assignedTo._id || record.assignedTo) : null;
  return Promise.all([notifyUser(owner, { ...payload, link }), assignee && assignee !== owner ? notifyUser(assignee, { ...payload, link }) : null]);
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
