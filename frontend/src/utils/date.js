const DAY = 24 * 60 * 60 * 1000;

export const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY).toISOString();

export const daysAgo = (days) => addDays(new Date(), -days);

// Whole days from now until the date (negative once it has passed)
export const daysUntil = (date) => Math.ceil((new Date(date).getTime() - Date.now()) / DAY);

export const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const formatRelative = (date) => {
  const diff = Math.round((Date.now() - new Date(date).getTime()) / DAY);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return formatDate(date);
};

// True when the date falls within the last `days` days
export const isWithinDays = (date, days) => Date.now() - new Date(date).getTime() < days * DAY;

// "just now", "5 min ago", "3 h ago", then the date
export const timeAgo = (date) => {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return formatRelative(date);
};

export const formatTime = (date) => new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
