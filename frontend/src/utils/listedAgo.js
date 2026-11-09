import { formatDate } from "./date";

const DAY = 24 * 60 * 60 * 1000;

// "Listed today" / "Listed yesterday" / "Listed 3 days ago" / "Listed 2 weeks ago", then the date
export const listedAgo = (date, now = Date.now()) => {
  const time = new Date(date).getTime();
  if (!Number.isFinite(time)) return "";
  const days = Math.max(0, Math.floor((now - time) / DAY));
  if (days === 0) return "Listed today";
  if (days === 1) return "Listed yesterday";
  if (days < 14) return `Listed ${days} days ago`;
  if (days < 60) return `Listed ${Math.floor(days / 7)} weeks ago`;
  return `Listed ${formatDate(date)}`;
};
