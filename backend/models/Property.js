import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";
import { roomTypeSchema } from "./roomTypeSchema.js";

const propertySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", maxlength: 3000 },
    price: { type: Number, required: true, min: 0 },
    pricePeriod: { type: String, enum: ["total", "month", "night"], default: "total" },
    currency: { type: String, default: "GHS" },
    propertyType: { type: String, required: true, index: true },
    listingType: { type: String, enum: ["Sale", "Rent"], required: true },
    location: {
      address: { type: String, default: "" },
      neighbourhood: { type: String, default: "" },
      city: { type: String, default: "", index: true },
      region: { type: String, default: "" },
      country: { type: String, default: "Ghana", trim: true },
      digitalAddress: { type: String, default: "", trim: true, maxlength: 30 },
      latitude: { type: Number, default: null, min: -90, max: 90 },
      longitude: { type: Number, default: null, min: -180, max: 180 },
    },
    bedrooms: { type: Number, default: 0, min: 0 },
    bathrooms: { type: Number, default: 0, min: 0 },
    area: { type: Number, default: 0, min: 0 },
    areaUnit: { type: String, default: "sqm" },
    amenities: [{ type: String, trim: true }],
    images: [{ type: String }], // Cloudinary (or static) URLs, never raw files
    roomTypes: [roomTypeSchema],
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true }, // agency staff member handling it (null: the owner)
    ownerType: { type: String, enum: ["admin", "agent"], required: true },
    // Public contact shown on the listing (the agent, or a HomeBase staff member)
    contact: {
      id: String,
      name: String,
      phone: String,
      email: String,
    },
    // draft -> pending (review) -> published | rejected; suspended = hidden by admin
    status: { type: String, enum: ["draft", "pending", "published", "rejected", "suspended"], default: "draft", index: true },
    availability: { type: String, enum: ["Available", "Under Offer", "Sold", "Rented"], default: "Available" },
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
  { ...schemaOptions, optimisticConcurrency: true }
);

export default mongoose.models.Property || mongoose.model("Property", propertySchema);
