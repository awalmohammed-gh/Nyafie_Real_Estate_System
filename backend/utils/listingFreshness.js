import Property from "../models/Property.js";
import { notifyOwner } from "./notify.js";

/**
 * Listing freshness: homes that are already taken should not stay in search.
 *  - An owner confirms a listing is still available by creating, publishing or editing it, or with
 *    "Still available" in their listings.
 *  - REMIND_AFTER_DAYS after the last confirmation, the owner is asked to confirm it again.
 *  - GRACE_DAYS after that reminder without an answer, the listing is hidden from the public
 *    (search, map, details, bookings) until the owner confirms it. Nothing is deleted.
 * Hotels are not included: their room bookings keep their availability up to date.
 */
export const REMIND_AFTER_DAYS = 30;
export const GRACE_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;
const OPEN = ["Available", "Under Offer"];

// The owner (or an admin) says the home is still available: it is fresh again, and visible again
export const markConfirmed = (property, now = new Date()) => {
  property.set({ availabilityConfirmedAt: now, freshnessReminderAt: null, staleSince: null });
  return property;
};

// Open, published, non-hotel listings that are not hidden yet
const tracked = { status: "published", availability: { $in: OPEN }, propertyType: { $not: /^hotel$/i }, staleSince: null };

/**
 * One pass of the daily job: reminds owners about listings not confirmed for 30 days and hides
 * listings whose reminder went unanswered for 14 days. Each listing is claimed atomically, so
 * overlapping runs never remind or hide it twice. Bounded per run. Returns { reminded, hidden }.
 */
export const checkListingFreshness = async (now = new Date(), { limit = 100 } = {}) => {
  const cutoff = new Date(now.getTime() - REMIND_AFTER_DAYS * DAY);
  const graceCutoff = new Date(now.getTime() - GRACE_DAYS * DAY);
  let reminded = 0, hidden = 0;

  for (let i = 0; i < limit; i++) {
    const listing = await Property.findOneAndUpdate(
      { ...tracked, freshnessReminderAt: null, $or: [{ availabilityConfirmedAt: { $lt: cutoff } }, { availabilityConfirmedAt: null, updatedAt: { $lt: cutoff } }] },
      { $set: { freshnessReminderAt: now } },
      { returnDocument: "after", timestamps: false },
    );
    if (!listing) break;
    reminded += 1;
    await notifyOwner(listing, { type: "status", title: "Is your listing still available?", message: `Confirm that "${listing.title}" is still available within ${GRACE_DAYS} days, or mark it as rented or sold. Unconfirmed listings are hidden from search.`, path: "properties" });
  }

  for (let i = 0; i < limit; i++) {
    const listing = await Property.findOneAndUpdate(
      { ...tracked, freshnessReminderAt: { $lte: graceCutoff } },
      { $set: { staleSince: now, isFeatured: false } },
      { returnDocument: "after", timestamps: false },
    );
    if (!listing) break;
    hidden += 1;
    await notifyOwner(listing, { type: "status", title: "Listing hidden until you confirm it", message: `"${listing.title}" is hidden from search because it wasn't confirmed as available. Confirm it to show it again.`, path: "properties" });
  }
  return { reminded, hidden };
};

// What owners and admins see about a listing's freshness
export const freshnessState = (property) => {
  if (property.staleSince) return "hidden";
  if (property.freshnessReminderAt) return "confirm";
  return "fresh";
};
