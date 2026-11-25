// Explicit recovery: npm run admin:reset aligns the sole admin with backend/.env.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/mongodb.js";
import User from "../models/User.js";
import { passwordProblem } from "../utils/passwordPolicy.js";
import { createLoginAttempts } from "../utils/loginAttempts.js";
import { endSessions } from "../utils/sessions.js";

try {
  const password = process.env.ADMIN_PSD;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Set a valid ADMIN_EMAIL in backend/.env first.");
  const problem = passwordProblem(password);
  if (problem) throw new Error(`Set ADMIN_PSD in backend/.env: ${problem}`);
  await connectDB();
  if (await User.countDocuments({ role: "admin" }) > 1) throw new Error("Multiple admin accounts exist. Select the intended account explicitly before recovery.");
  const admin = await User.findOne({ role: "admin" });
  if (!admin) throw new Error("No admin account exists yet. Start the server once to create it.");
  const collision = await User.findOne({ email });
  if (collision && String(collision._id) !== String(admin._id)) throw new Error("ADMIN_EMAIL belongs to another account. No account was changed.");
  const previousEmail = admin.email;
  admin.set({ email, password, isActive: true });
  await admin.save(); // hashed by the pre-save hook
  await endSessions(admin._id, "password");
  // An authorized operator recovery clears durable locks for the old and current address.
  const attempts = createLoginAttempts({ persistent: () => true });
  await attempts.resetAfterRecovery(previousEmail);
  await attempts.resetAfterRecovery(email);
  console.log("Admin credentials now match ADMIN_EMAIL and ADMIN_PSD. Previous sessions were revoked.");
} catch (error) {
  console.error("Reset failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
