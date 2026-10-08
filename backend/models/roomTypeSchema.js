import mongoose from "mongoose";

const integer = { validator: Number.isInteger, message: "Must be a whole number." };
// Embedded sub-items: a room ID is only resolved inside its owning hotel.
export const roomTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: "", maxlength: 3000 },
  pricePerNight: { type: Number, required: true, min: 0.01, max: 10000000 },
  quantity: { type: Number, required: true, min: 0, max: 10000, validate: integer },
  maxGuests: { type: Number, required: true, min: 1, max: 50, validate: integer },
  beds: { type: Number, required: true, min: 1, max: 30, validate: integer },
  bedType: { type: String, required: true, trim: true, maxlength: 120 },
  size: { type: Number, default: 0, min: 0, max: 100000 },
  sizeUnit: { type: String, enum: ["sqm", "sqft"], default: "sqm" },
  images: [String],
  amenities: [{ type: String, trim: true, maxlength: 100 }],
  active: { type: Boolean, default: true },
}, { toJSON: { virtuals: true, transform: (_doc, ret) => { delete ret._id; return ret; } } });
