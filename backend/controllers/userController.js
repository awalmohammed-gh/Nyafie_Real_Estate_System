import Property from "../models/Property.js";
import { ok, fail } from "../utils/response.js";

// GET /api/users/saved -> ids of saved properties
export const getSaved = async (req, res) => {
  ok(res, req.user.savedProperties.map(String));
};

// POST /api/users/saved/:propertyId -> toggles a saved property
// Saved homes are stored in the account's own record, which has a size limit
const MAX_SAVED_PROPERTIES = 500;

export const toggleSaved = async (req, res) => {
  const property = await Property.exists({ _id: req.params.propertyId }).catch(() => null);
  if (!property) return fail(res, 404, "Property not found.");

  const id = String(req.params.propertyId);
  const saved = req.user.savedProperties.map(String);
  if (!saved.includes(id) && saved.length >= MAX_SAVED_PROPERTIES) return fail(res, 400, `You can save up to ${MAX_SAVED_PROPERTIES} homes. Remove some you no longer need first.`);
  req.user.savedProperties = saved.includes(id) ? saved.filter((s) => s !== id) : [...saved, id];
  await req.user.save();
  ok(res, req.user.savedProperties.map(String), saved.includes(id) ? "Removed from saved" : "Saved");
};
