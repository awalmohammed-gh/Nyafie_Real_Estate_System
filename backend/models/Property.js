import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";
import { roomTypeSchema } from "./roomTypeSchema.js";

// GeoJSON point for nearby search. Coordinates are always [longitude, latitude].
const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ["Point"], required: true },
  coordinates: { type: [Number], required: true },
}, { _id: false });

// Hotels and per-night rentals: how guests may pay. Read through stayBookingSettings()
// (utils/hotelPayout.js), which fills in each kind's defaults for listings saved before these existed.
const stayBookingSchema = new mongoose.Schema({
  payOnArrival: { type: Boolean }, // reserve now, pay on arrival
  payOnline: { type: Boolean }, // pay through Paystack (agent hotels: needs the hotel's payout account)
  arrivalDeadline: { type: String, default: "18:00", match: /^([01]\d|2[0-3]):[0-5]\d$/ }, // check-in day, Ghana time (GMT)
  cancellationPolicy: { type: String, default: "", trim: true, maxlength: 800 }, // includes the no-show policy
}, { _id: false });

// Monthly rentals: what a tenant pays to move in besides the first rent (utils/moveIn.js). Shown
// to customers as information; online rental payments still cover the booked rent only.
const moveInSchema = new mongoose.Schema({
  advanceMonths: { type: Number, default: 0, min: 0, max: 36 }, // months of rent paid upfront
  agentFeeType: { type: String, enum: ["none", "percent", "fixed"], default: "none" },
  agentFeeValue: { type: Number, default: 0, min: 0 }, // % of the advance, or GHS
  securityDeposit: { type: Number, default: 0, min: 0 }, // GHS
}, { _id: false });

const mediaLinkSchema = new mongoose.Schema({
  provider: { type: String, enum: ["youtube", "vimeo", "matterport", "kuula"], required: true },
  id: { type: String, required: true, maxlength: 40 },
  hash: { type: String, maxlength: 30 }, // Vimeo unlisted videos
}, { _id: false });

const propertySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", maxlength: 3000 },
    price: { type: Number, required: true, min: 0 },
    pricePeriod: { type: String, enum: ["total", "month", "night"], default: "total" },
    currency: { type: String, default: "GHS", maxlength: 10 },
    propertyType: { type: String, required: true, index: true },
    listingType: { type: String, enum: ["Sale", "Rent"], required: true },
    location: {
      address: { type: String, default: "", maxlength: 200 },
      neighbourhood: { type: String, default: "", maxlength: 100 },
      city: { type: String, default: "", index: true, maxlength: 100 },
      region: { type: String, default: "", maxlength: 100 },
      country: { type: String, default: "Ghana", trim: true },
      digitalAddress: { type: String, default: "", trim: true, maxlength: 30 },
      latitude: { type: Number, default: null, min: -90, max: 90 },
      longitude: { type: Number, default: null, min: -180, max: 180 },
      // How the coordinates were set: "map" = placed by a person (exact), "address" = found from the
      // neighbourhood and city (approximate, shown as "About … away"). Unset on older pins = exact.
      pinSource: { type: String, enum: ["map", "address"], default: undefined },
    },
    // Derived from location.latitude/longitude on every save (see the hook below); never written by clients.
    // Absent when the listing has no map pin, so it is left out of nearby search instead of guessed.
    geo: { type: pointSchema, default: undefined },
    bedrooms: { type: Number, default: 0, min: 0 },
    bathrooms: { type: Number, default: 0, min: 0 },
    area: { type: Number, default: 0, min: 0 },
    areaUnit: { type: String, default: "sqm", maxlength: 20 },
    amenities: [{ type: String, trim: true }],
    images: [{ type: String }], // Cloudinary (or static) URLs, never raw files
    // Video tour (YouTube/Vimeo) and 3D tour (Matterport/Kuula): provider + id only (utils/mediaLinks.js)
    video: { type: mediaLinkSchema, default: null },
    virtualTour: { type: mediaLinkSchema, default: null },
    roomTypes: [roomTypeSchema],
    stayBooking: { type: stayBookingSchema, default: undefined },
    moveIn: { type: moveInSchema, default: undefined },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true }, // agency staff member handling it (null: the owner)
    ownerType: { type: String, enum: ["admin", "agent"], required: true },
    // Public contact shown on the listing (the agent, or a NyaFie staff member)
    contact: {
      id: String,
      name: String,
      phone: String,
      email: String,
    },
    // draft -> pending (review) -> published | rejected; suspended = hidden by admin
    status: { type: String, enum: ["draft", "pending", "published", "rejected", "suspended"], default: "draft", index: true },
    availability: { type: String, enum: ["Available", "Under Offer", "Sold", "Rented"], default: "Available" },
    // Listing freshness (utils/listingFreshness.js): when the owner last confirmed it is still
    // available, when they were asked again, and since when it is hidden for not answering
    availabilityConfirmedAt: { type: Date, default: null },
    freshnessReminderAt: { type: Date, default: null },
    staleSince: { type: Date, default: null },
    // Set when NyaFie checked the ownership documents the owner submitted (utils/propertyDocuments.js);
    // the documents themselves are private and never part of the listing
    documentsVerifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },
    // Set when the listing was hidden because its provider was removed; restore can bring it back
    providerRemoval: { type: new mongoose.Schema({ hiddenAt: Date, statusBefore: String }, { _id: false }), default: undefined },
    reviewedAt: { type: Date },
    isFeatured: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    // Kept in sync with published customer reviews (utils/reviews.js); null until the first one
    ratingAverage: { type: Number, default: null, min: 1, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  {
    ...schemaOptions,
    optimisticConcurrency: true,
    // geo duplicates location.latitude/longitude, which API consumers already read
    toJSON: { ...schemaOptions.toJSON, transform: (doc, ret) => { schemaOptions.toJSON.transform(doc, ret); delete ret.geo; return ret; } },
  }
);

export const geoPoint = (location) => {
  const latitude = location?.latitude, longitude = location?.longitude;
  const valid = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  return valid ? { type: "Point", coordinates: [longitude, latitude] } : undefined;
};

// Every create/save path (agent, admin, hotel transaction) passes through validation
propertySchema.pre("validate", function syncGeo() {
  const point = geoPoint(this.location);
  const current = this.geo?.coordinates;
  if (!point) { if (this.geo !== undefined) this.geo = undefined; return; }
  if (current?.[0] !== point.coordinates[0] || current?.[1] !== point.coordinates[1]) this.geo = point;
});

propertySchema.index({ geo: "2dsphere" });

export default mongoose.models.Property || mongoose.model("Property", propertySchema);
