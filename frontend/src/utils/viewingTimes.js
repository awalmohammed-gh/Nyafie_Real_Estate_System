// Viewing times are picked and shown in Ghana time (Africa/Accra: UTC all year, no daylight saving),
// whatever the visitor's device is set to. Mirrors VIEWING_RULES in backend/utils/viewings.js; the
// server checks every time again.
export const VIEWING_RULES = Object.freeze({ firstHour: 8, lastHour: 18, slotMinutes: 30, minNoticeHours: 2, maxDaysAhead: 60 });

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const pad = (n) => String(n).padStart(2, "0");
const dateOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// Every bookable slot of a day: "08:00", "08:30" ... "18:00"
export const VIEWING_SLOTS = (() => {
  const { firstHour, lastHour, slotMinutes } = VIEWING_RULES;
  const slots = [];
  for (let minutes = firstHour * 60; minutes <= lastHour * 60; minutes += slotMinutes) slots.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  return slots;
})();

const at = (date, time) => new Date(`${date}T${time}:00Z`).getTime();

// The slots still bookable on `date` (today loses the ones less than the notice period away)
export const availableSlots = (date, now = Date.now()) => {
  if (!date) return [];
  const earliest = now + VIEWING_RULES.minNoticeHours * HOUR;
  const latest = now + VIEWING_RULES.maxDaysAhead * DAY;
  return VIEWING_SLOTS.filter((time) => at(date, time) >= earliest && at(date, time) <= latest);
};

// The date picker's range, skipping today once its last slot is too soon
export const viewingDateRange = (now = Date.now()) => {
  const today = dateOf(now);
  return { min: availableSlots(today, now).length ? today : dateOf(now + DAY), max: dateOf(now + VIEWING_RULES.maxDaysAhead * DAY) };
};

// { date, time } of a stored viewing, to prefill a "suggest another time" form
export const viewingParts = (iso) => (iso ? { date: new Date(iso).toISOString().slice(0, 10), time: new Date(iso).toISOString().slice(11, 16) } : { date: "", time: "" });

const WHEN = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Accra" });
const DAY_ONLY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Accra" });

// "Tue 25 Nov 10:30"
export const formatViewingTime = (iso) => WHEN.format(new Date(iso)).replace(",", "");
// "Tuesday 25 November"
export const formatViewingDay = (iso) => DAY_ONLY.format(new Date(iso));
