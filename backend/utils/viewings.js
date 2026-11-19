import Viewing from "../models/Viewing.js";
import { notifyOwner, notifyUser } from "./notify.js";
import { HttpError } from "./response.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Viewings are booked in Ghana time (Africa/Accra is UTC all year, with no daylight saving), in
// 30-minute slots during the day, from a couple of hours ahead to two months ahead.
export const VIEWING_RULES = Object.freeze({ firstHour: 8, lastHour: 18, slotMinutes: 30, minNoticeHours: 2, maxDaysAhead: 60 });

const WHEN = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Accra" });
export const formatViewingTime = (date) => WHEN.format(new Date(date)).replace(",", "");

/**
 * The viewing time from a date ("2026-12-01") and a slot ("14:30") picked in Ghana time.
 * Throws a 400 explaining what to change when the time can't be booked.
 */
export const parseViewingTime = ({ date, time } = {}, now = new Date()) => {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time))
    throw new HttpError(400, "Choose a date and time for the viewing.");
  const [hours, minutes] = time.split(":").map(Number);
  const { firstHour, lastHour, slotMinutes, minNoticeHours, maxDaysAhead } = VIEWING_RULES;
  if (minutes % slotMinutes !== 0 || hours < firstHour || hours > lastHour || (hours === lastHour && minutes > 0))
    throw new HttpError(400, `Choose a time between ${String(firstHour).padStart(2, "0")}:00 and ${lastHour}:00, on the hour or half hour.`);
  const at = new Date(`${date}T${time}:00Z`); // Ghana time is UTC
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== date) throw new HttpError(400, "Choose a valid date for the viewing.");
  if (at.getTime() < now.getTime() + minNoticeHours * HOUR) throw new HttpError(400, `Choose a time at least ${minNoticeHours} hours from now.`);
  if (at.getTime() > now.getTime() + maxDaysAhead * DAY) throw new HttpError(400, `Viewings can be booked up to ${maxDaysAhead} days ahead.`);
  return at;
};

/**
 * Viewings whose time has passed stop blocking a new booking: unanswered requests expire, and
 * confirmed ones stay as they are for the owner to mark as completed or missed.
 * `scope` narrows it (e.g. one customer and listing). Returns how many requests expired.
 */
export const releasePastViewings = async (now = new Date(), scope = {}) => {
  const past = { ...scope, openKey: { $exists: true }, scheduledAt: { $lt: now } };
  const [expired] = await Promise.all([
    Viewing.updateMany({ ...past, status: "requested" }, { $set: { status: "expired" }, $unset: { openKey: "" }, $push: { history: { status: "expired", note: "The time passed without an answer", at: now } } }),
    Viewing.updateMany({ ...past, status: "confirmed" }, { $unset: { openKey: "" } }),
  ]);
  return expired.modifiedCount || 0;
};

const dayWord = (at, now) => {
  const days = Math.round((Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / DAY);
  return days === 0 ? "today" : days === 1 ? "tomorrow" : `on ${formatViewingTime(at).split(" ").slice(0, 3).join(" ")}`;
};

/**
 * Daily job: reminds both sides of confirmed viewings happening today or tomorrow (Ghana time),
 * once per viewing. Each reminder is claimed atomically, so overlapping runs never send it twice.
 */
export const sendViewingReminders = async (now = new Date(), { limit = 200 } = {}) => {
  const endOfTomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2));
  let sent = 0;
  for (let i = 0; i < limit; i++) {
    const viewing = await Viewing.findOneAndUpdate(
      { status: "confirmed", reminderSentAt: null, scheduledAt: { $gt: now, $lt: endOfTomorrow } },
      { $set: { reminderSentAt: now } },
      { returnDocument: "after", sort: { scheduledAt: 1 } },
    ).populate("property", "title");
    if (!viewing) break;
    const when = `${dayWord(viewing.scheduledAt, now)} at ${formatViewingTime(viewing.scheduledAt).split(" ").pop()}`;
    const title = viewing.property?.title || "the property";
    await Promise.all([
      notifyUser(viewing.customer, { type: "viewing", title: "Viewing reminder", message: `Your viewing of "${title}" is ${when}.`, link: "/account/viewings" }),
      notifyOwner(viewing, { type: "viewing", title: "Viewing reminder", message: `${viewing.contactName} is viewing "${title}" ${when}.`, path: "viewings" }),
    ]);
    sent += 1;
  }
  return sent;
};
