import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

export const CONTACT_STATUSES = ["new", "contacted", "inProgress", "closed"];

const contactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, trim: true, default: "", maxlength: 30 },
  subject: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 4000 },
  status: { type: String, enum: CONTACT_STATUSES, default: "new" },
}, schemaOptions);
contactMessageSchema.index({ status: 1, createdAt: -1 });
contactMessageSchema.index({ createdAt: -1 });

export default mongoose.models.ContactMessage || mongoose.model("ContactMessage", contactMessageSchema);
