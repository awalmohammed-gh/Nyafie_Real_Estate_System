import mongoose from "mongoose";
import { ACCOUNT_TYPES } from "../utils/accountTypes.js";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { schemaOptions } from "../utils/schemaOptions.js";
import { validPasswordInput } from "../utils/passwordPolicy.js";

const applicationSchema = new mongoose.Schema({
  // removed: taken off HomeBase by an admin (no sign-in, listings hidden); only an admin can restore it
  status: { type: String, enum: ["incomplete", "pending", "approved", "rejected", "suspended", "removed"], default: "incomplete", index: true },
  agentType: { type: String, enum: ACCOUNT_TYPES, default: "individual" },
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

// An organisation membership that ended (left, removed by the owner, or the organisation was removed).
// Kept so team history stays readable after the live membership is cleared.
const pastMembershipSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  role: { type: String, enum: ["manager", "agent"], required: true },
  joinedAt: { type: Date },
  endedAt: { type: Date, default: Date.now },
  reason: { type: String, enum: ["removed-by-owner", "member-removed", "organisation-removed"], required: true },
}, { _id: false });

// Why and when an admin removed a provider (internal only, never shown publicly)
const removalSchema = new mongoose.Schema({
  removedAt: { type: Date, required: true },
  removedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reason: { type: String, enum: ["fraud", "policy", "duplicate", "closed", "other"], required: true },
  note: { type: String, maxlength: 1000, default: "" },
  statusBefore: { type: String, default: "incomplete" }, // application status to return to on restore
  wasStaffOf: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // set when a staff member was removed
  restoredAt: { type: Date, default: null },
  restoredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  deletedAt: { type: Date, default: null }, // personal details permanently erased (the record stays for history)
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { _id: false });

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    emailVerifiedAt: { type: Date, default: null },
    googleId: { type: String, unique: true, sparse: true, select: false },
    phone: { type: String, default: "", trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    // Empty only for accounts whose password has never changed. Older cookies
    // remain compatible until the first change; every later change revokes them.
    sessionVersion: { type: String, default: "", select: false },
    profileImage: { type: String, default: "" },
    // Roles and application decisions are assigned only by server-owned flows.
    role: { type: String, enum: ["user", "agent", "admin"], default: "user" },
    customerAccess: { type: Boolean, default: false }, // retained only when a customer starts agent onboarding
    isActive: { type: Boolean, default: true },
    agentApplication: { type: applicationSchema, default: undefined },
    // Current subscription for agents (full history lives in the Subscription collection)
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription", default: null },
    // Agency staff: the agency owner's account and this member's role there. Set only by accepting an
    // invite and cleared on removal. The owner's plan, listings and limits apply to the member.
    agency: {
      type: new mongoose.Schema({ owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, role: { type: String, enum: ["manager", "agent"], required: true }, joinedAt: { type: Date, default: Date.now } }, { _id: false }),
      default: undefined,
    },
    pastMemberships: { type: [pastMembershipSchema], default: undefined },
    removal: { type: removalSchema, default: undefined },
    savedProperties: [{ type: mongoose.Schema.Types.ObjectId, ref: "Property" }],
    preferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  schemaOptions
);

userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
  // Persist the password hash and revocation marker in the same database write.
  // Random versions also distinguish changes made within the same second.
  if (!this.isNew) this.sessionVersion = randomUUID();
});

userSchema.methods.matchPassword = function matchPassword(plain) {
  if (!validPasswordInput(plain)) return Promise.resolve(false);
  return bcrypt.compare(plain, this.password);
};

export default mongoose.models.User || mongoose.model("User", userSchema);
