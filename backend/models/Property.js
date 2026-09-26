import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

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
    },
    bedrooms: { type: Number, default: 0, min: 0 },
    bathrooms: { type: Number, default: 0, min: 0 },
    area: { type: Number, default: 0, min: 0 },
    areaUnit: { type: String, default: "sqm" },
    amenities: [{ type: String, trim: true }],
    images: [{ type: String }], // Cloudinary (or static) URLs, never raw files
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
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
    reviewedAt: { type: Date },
    isFeatured: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    rating: { type: Number, default: null },
  },
  schemaOptions
);

export default mongoose.models.Property || mongoose.model("Property", propertySchema);
