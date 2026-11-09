import Notification from "../models/Notification.js";
import TeamInvite from "../models/TeamInvite.js";

const DAY = 24 * 60 * 60 * 1000;
export const READ_NOTIFICATION_DAYS = 180;
export const NOTIFICATION_DAYS = 365;
const EXPIRED_INVITE_DAYS = 30;

/**
 * Daily tidy-up so collections that would otherwise grow forever stay small:
 *  - notifications: read ones after 6 months, any after a year (the records they point to are kept)
 *  - team invites that expired more than 30 days ago
 * Business records (bookings, payments, offers, messages...) are never touched.
 * Returns how many of each were removed.
 */
export const cleanUpOldRecords = async (now = new Date()) => {
  const [read, old, invites] = await Promise.all([
    Notification.deleteMany({ read: true, createdAt: { $lt: new Date(now.getTime() - READ_NOTIFICATION_DAYS * DAY) } }),
    Notification.deleteMany({ createdAt: { $lt: new Date(now.getTime() - NOTIFICATION_DAYS * DAY) } }),
    TeamInvite.deleteMany({ expiresAt: { $lt: new Date(now.getTime() - EXPIRED_INVITE_DAYS * DAY) } }),
  ]);
  return { notifications: read.deletedCount + old.deletedCount, invites: invites.deletedCount };
};
