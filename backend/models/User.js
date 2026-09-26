import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { schemaOptions } from "../utils/schemaOptions.js";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: "", trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    profileImage: { type: String, default: "" },
    // Role is only ever changed by the server (payment verification or admin actions)
    role: { type: String, enum: ["user", "agent", "admin"], default: "user" },
    isActive: { type: Boolean, default: true },
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
