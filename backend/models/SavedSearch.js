import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

/**
 * A customer's saved property search. `filters` holds the same filters as the listings page
 * (utils/savedSearches.js parseSavedFilters), so alerts match exactly what the customer sees
 * when they open the search. New published listings that match it notify the customer once.
 */
const nearSchema = new mongoose.Schema({
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  radius: { type: Number, required: true }, // km
  label: { type: String, default: "", maxlength: 120 },
}, { _id: false });

const savedSearchSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    filters: {
      listingType: { type: String, enum: ["", "Sale", "Rent"], default: "" },
      stay: { type: Boolean, default: false }, // short stays only
      types: [{ type: String, maxlength: 60 }],
      area: { type: String, default: "", maxlength: 80 },
      city: { type: String, default: "", maxlength: 80 },
      region: { type: String, default: "", maxlength: 80 },
      minPrice: { type: Number, default: null, min: 0 },
      maxPrice: { type: Number, default: null, min: 0 },
      bedrooms: { type: Number, default: 0, min: 0, max: 50 },
      bathrooms: { type: Number, default: 0, min: 0, max: 50 },
      availability: { type: String, enum: ["", "Available", "Under Offer"], default: "" },
      amenities: [{ type: String, maxlength: 60 }],
      search: { type: String, default: "", maxlength: 80 },
      near: { type: nearSchema, default: null },
    },
    emailAlerts: { type: Boolean, default: true },
    // Listings already announced for this search (most recent 200), so each match is sent once
    alertedIds: [{ type: mongoose.Schema.Types.ObjectId }],
    lastAlertAt: { type: Date, default: null },
    lastEmailAt: { type: Date, default: null },
  },
  schemaOptions
);

savedSearchSchema.index({ "filters.listingType": 1 });

export default mongoose.models.SavedSearch || mongoose.model("SavedSearch", savedSearchSchema);
