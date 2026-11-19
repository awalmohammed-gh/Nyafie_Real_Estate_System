import { readStorage, writeStorage } from "./storage";

// Lists kept in this browser only (no account needed): homes recently viewed and homes picked to
// compare. Only listing ids are stored; the listings themselves are always loaded fresh, so
// hidden or removed ones simply drop out.
export const RECENT_KEY = "nyafie:recently-viewed";
export const COMPARE_KEY = "nyafie:compare";
export const RECENT_LIMIT = 12;
export const COMPARE_LIMIT = 3;
export const BROWSING_LISTS_CHANGED = "nyafie:browsing-lists-changed";

const valid = (ids) => (Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id)) : []);
const save = (key, ids) => {
  writeStorage(key, ids);
  window.dispatchEvent(new CustomEvent(BROWSING_LISTS_CHANGED, { detail: key }));
  return ids;
};

export const readList = (key) => valid(readStorage(key, []));

// Most recent first, without repeats
export const addRecentlyViewed = (id) => save(RECENT_KEY, [id, ...readList(RECENT_KEY).filter((other) => other !== id)].slice(0, RECENT_LIMIT));
export const clearRecentlyViewed = () => save(RECENT_KEY, []);

/** Adds or removes a home from the comparison. Returns { ids, added, full }. */
export const toggleCompare = (id) => {
  const ids = readList(COMPARE_KEY);
  if (ids.includes(id)) return { ids: save(COMPARE_KEY, ids.filter((other) => other !== id)), added: false, full: false };
  if (ids.length >= COMPARE_LIMIT) return { ids, added: false, full: true };
  return { ids: save(COMPARE_KEY, [...ids, id]), added: true, full: false };
};
export const clearCompare = () => save(COMPARE_KEY, []);

// Keeps loaded listings in the order of the stored ids
export const inOrder = (ids, items) => ids.map((id) => items.find((item) => item.id === id)).filter(Boolean);
