import mongoose from "mongoose";
import { ACCOUNT_TYPES } from "../utils/accountTypes.js";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { schemaOptions } from "../utils/schemaOptions.js";
import { validPasswordInput } from "../utils/passwordPolicy.js";

const agentProofSchema = new mongoose.Schema({
  kind: { type: String, required: true },
  name: { type: String, required: true, maxlength: 120 },
  publicId: { type: String, required: true },
  format: { type: String, required: true },
  bytes: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
});

const applicationSchema = new mongoose.Schema({
  // removed: taken off NyaFie by an admin (no sign-in, listings hidden); only an admin can restore it
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
  proofCount: { type: Number, min: 0, max: 4, default: 0 },
  proofDocuments: { type: [agentProofSchema], default: [], select: false },
  proofReviewedAt: { type: Date, default: null },
  proofReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
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
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // One value per inbox (utils/signupEmail.js); accounts from before it was stored have none
    emailKey: { type: String, select: false },
    emailVerifiedAt: { type: Date, default: null }, // when this person proved the email is theirs
    googleId: { type: String, unique: true, sparse: true, select: false },
    // When this person chose (or signed in with) a NyaFie password. A Google account without it has only a
    // random one nobody knows: Google never shares the Google password.
    passwordSetAt: { type: Date, select: false },
    phone: { type: String, default: "", trim: true, maxlength: 30 },
    password: { type: String, required: true, minlength: 8, select: false },
    // Empty only for accounts whose password has never changed. Older cookies
    // remain compatible until the first change; every later change revokes them.
    sessionVersion: { type: String, default: "", select: false },
    profileImage: { type: String, default: "" },
    // Roles and application decisions are assigned only by server-owned flows.
    role: { type: String, enum: ["user", "agent", "admin"], default: "user" },
    // Started as a customer, so agent onboarding asks for the plan before the profile (utils/agentApplication.js).
    // Not a permission: every agent can use the customer area (utils/sessionAccess.js).
    customerAccess: { type: Boolean, default: false },
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
    // Agency owners: when someone last joined the team. Each join writes it inside its transaction,
    // so two joins at the same moment conflict and the team's member limit always holds.
    teamChangedAt: { type: Date, default: undefined },
    removal: { type: removalSchema, default: undefined },
    savedProperties: [{ type: mongoose.Schema.Types.ObjectId, ref: "Property" }],
    preferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  schemaOptions
);

userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  // A finished sign-up arrives already hashed (utils/registration.js): never hash it twice
  if (!this.$locals.passwordHashed) this.password = await bcrypt.hash(this.password, 10);
  if (!this.$locals.randomPassword) this.passwordSetAt = new Date();
  // Persist the password hash and revocation marker in the same database write.
  // Random versions also distinguish changes made within the same second.
  if (!this.isNew) this.sessionVersion = randomUUID();
});

userSchema.methods.matchPassword = function matchPassword(plain) {
  if (!validPasswordInput(plain)) return Promise.resolve(false);
  return bcrypt.compare(plain, this.password);
};

userSchema.index({ emailKey: 1 }, { unique: true, partialFilterExpression: { emailKey: { $type: "string" } } });
// Agent and customer lists and counts in the admin console, newest first
userSchema.index({ role: 1, createdAt: -1 });
// How many customers saved a listing (listing insights)
userSchema.index({ savedProperties: 1 });

export default mongoose.models.User || mongoose.model("User", userSchema);
