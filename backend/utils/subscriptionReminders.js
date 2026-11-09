import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import { notifyUser } from "./notify.js";

const DAY = 24 * 60 * 60 * 1000;
export const REMINDER_WINDOW_DAYS = 7;
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Tells agents, once per subscription period, that their plan expires within 7 days. Renewal is
 * always manual (the agent pays again from Subscription): nothing is ever charged automatically,
 * which also suits mobile money. Each reminder is claimed atomically, so overlapping scheduled
 * runs never send it twice. Only the plan currently on the account is reminded about.
 */
export const sendRenewalReminders = async (now = new Date(), { limit = 50 } = {}) => {
  let sent = 0;
  for (let checked = 0; checked < limit; checked++) {
    const subscription = await Subscription.findOneAndUpdate(
      { status: "active", renewalReminderAt: null, expiresAt: { $gt: now, $lte: new Date(now.getTime() + REMINDER_WINDOW_DAYS * DAY) } },
      { $set: { renewalReminderAt: now } },
      { returnDocument: "after", sort: { expiresAt: 1 } },
    );
    if (!subscription) break;
    const holder = await User.findById(subscription.user).select("subscription role");
    if (!holder || holder.role !== "agent" || String(holder.subscription) !== String(subscription._id)) continue;
    const days = Math.max(1, Math.ceil((subscription.expiresAt - now) / DAY));
    await notifyUser(subscription.user, {
      type: "subscription",
      title: "Your plan expires soon",
      message: `Your subscription (${subscription.planName}) expires on ${DATE.format(subscription.expiresAt)} (in ${days} day${days === 1 ? "" : "s"}). Renew it from Subscription to keep your paid features. You won't be charged automatically.`,
      link: "/agent/subscription",
    });
    sent += 1;
  }
  return sent;
};
