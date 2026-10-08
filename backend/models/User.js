import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { schemaOptions } from "../utils/schemaOptions.js";

const applicationSchema = new mongoose.Schema({
  status: { type: String, enum: ["incomplete", "pending", "approved", "rejected", "suspended"], default: "incomplete", index: true },
  agentType: { type: String, enum: ["individual", "agency"], default: "individual" },
  companyName: { type: String, trim: true, maxlength: 160, default: "" },
  region: { type: String, trim: true, maxlength: 100, default: "" },
  city: { type: String, trim: true, maxlength: 100, default: "" },
  officeAddress: { type: String, trim: true, maxlength: 300, default: "" },
  ghanaPostGPS: { type: String, trim: true, maxlength: 30, default: "" },
  yearsExperience: { type: Number, min: 0, max: 80, default: 0 },
  bio: { type: String, trim: true, maxlength: 1500, default: "" },
  whatsapp: { type: String, trim: true, default: "" },
  agencyLogo: { type: String, default: "" },
  profileCompletedAt: { type: Date, default: null },
  submittedAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  rejectionReason: { type: String, maxlength: 1000, default: "" },
}, { _id: false });

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: "", trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    profileImage: { type: String, default: "" },
    // Roles and application decisions are assigned only by server-owned flows.
    role: { type: String, enum: ["user", "agent", "admin"], default: "user" },
    isActive: { type: Boolean, default: true },
    agentApplication: { type: applicationSchema, default: undefined },
    // Current subscription for agents (full history lives in the Subscription collection)
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription", default: null },
    savedProperties: [{ type: mongoose.Schema.Types.ObjectId, ref: "Property" }],
    preferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  schemaOptions
);

userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = function matchPassword(plain) {
  return bcrypt.compare(plain, this.password);
};

export default mongoose.models.User || mongoose.model("User", userSchema);
