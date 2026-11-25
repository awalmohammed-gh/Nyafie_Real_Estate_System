// Fired after an admin action changes a count (e.g. reviewing a report), so the badge updates at once
export const ADMIN_COUNTS_CHANGED = "admin-counts-changed";
export const adminCountsChanged = () => window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED));
