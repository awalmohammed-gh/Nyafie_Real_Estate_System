import { escapeRegex } from "./validation.js";
import { HttpError } from "./response.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_PAGE = 10000;

// ?page and ?limit of a paged list
export const pageOf = (query) => {
  const whole = (value, fallback, max) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 ? Math.min(number, max) : fallback;
  };
  const page = whole(query.page, 1, MAX_PAGE), limit = whole(query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
};

// What was typed in a search box, as a safe pattern (nothing typed acts as one); null when empty
export const searchPattern = (value) => {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length > 100) throw new HttpError(400, "Search must be 100 characters or fewer.");
  const text = value.trim().replace(/\s+/g, " ");
  return text ? new RegExp(escapeRegex(text), "i") : null;
};

// One of the allowed values, otherwise the fallback
export const choice = (value, allowed, fallback = "all") => (allowed.includes(value) ? value : fallback);

export const pageResult = (items, total, { page, limit }, extra = {}) => ({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), ...extra });

// Matches a search against "First Last"
export const fullNameMatch = (pattern) => ({
  $regexMatch: { input: { $concat: [{ $ifNull: ["$firstName", ""] }, " ", { $ifNull: ["$lastName", ""] }] }, regex: pattern.source, options: "i" },
});
