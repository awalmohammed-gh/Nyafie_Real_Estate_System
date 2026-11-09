import mongoose from "mongoose";
import SavedSearch from "../models/SavedSearch.js";
import { ok, fail } from "../utils/response.js";
import { MAX_SAVED_SEARCHES, describeSearch, parseSavedFilters, presentSavedSearch } from "../utils/savedSearches.js";

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const sameFilters = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plain = (filters) => JSON.parse(JSON.stringify(filters)); // a stored subdocument as plain values

// GET /api/saved-searches -> the customer's saved searches, newest first
export const listSavedSearches = async (req, res) => {
  const searches = await SavedSearch.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
  ok(res, searches.map(presentSavedSearch));
};

// POST /api/saved-searches { filters, name?, emailAlerts? }
export const createSavedSearch = async (req, res) => {
  const filters = parseSavedFilters(req.body?.filters);
  const existing = await SavedSearch.find({ user: req.user._id }).select("filters").lean();
  if (existing.length >= MAX_SAVED_SEARCHES) return fail(res, 400, `You can save up to ${MAX_SAVED_SEARCHES} searches. Delete one you no longer need first.`);
  const duplicate = existing.find((search) => sameFilters(plain(search.filters), filters));
  if (duplicate) return fail(res, 409, "You've already saved this search.");
  const search = await SavedSearch.create({
    user: req.user._id,
    name: text(req.body?.name, 80) || describeSearch(filters),
    filters,
    emailAlerts: req.body?.emailAlerts !== false,
  });
  ok(res, presentSavedSearch(search), "Search saved. We'll let you know when new homes match.", 201);
};

const loadOwn = async (req, res) => {
  const search = mongoose.isValidObjectId(req.params.id) ? await SavedSearch.findOne({ _id: req.params.id, user: req.user._id }) : null;
  if (!search) fail(res, 404, "Saved search not found.");
  return search;
};

// PATCH /api/saved-searches/:id { name?, emailAlerts? }
export const updateSavedSearch = async (req, res) => {
  const search = await loadOwn(req, res);
  if (!search) return;
  if (req.body?.name !== undefined) {
    const name = text(req.body.name, 80);
    if (!name) return fail(res, 400, "Give the search a name.");
    search.name = name;
  }
  if (req.body?.emailAlerts !== undefined) {
    if (typeof req.body.emailAlerts !== "boolean") return fail(res, 400, "Invalid email alert setting.");
    search.emailAlerts = req.body.emailAlerts;
  }
  await search.save();
  ok(res, presentSavedSearch(search), "Saved search updated");
};

// DELETE /api/saved-searches/:id
export const deleteSavedSearch = async (req, res) => {
  const search = await loadOwn(req, res);
  if (!search) return;
  await search.deleteOne();
  ok(res, { id: String(search._id) }, "Saved search deleted");
};
