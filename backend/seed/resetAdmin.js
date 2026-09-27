// Recovery for a forgotten admin password: npm run admin:reset
// Sets the password of the first admin account back to ADMIN_PSD from backend/.env.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/mongodb.js";
import User from "../models/User.js";

try {
  const password = process.env.ADMIN_PSD;
  if (!password || password.length < 8) throw new Error("Set ADMIN_PSD (8+ characters) in backend/.env first.");
  await connectDB();
  const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
  if (!admin) throw new Error("No admin account exists yet. Start the server once to create it.");
  admin.set({ password, isActive: true });
  await admin.save(); // hashed by the pre-save hook
  console.log(`Password reset for the admin account ${admin.email}. Sign in with ADMIN_PSD, then change it in Admin Settings.`);
} catch (error) {
  console.error("Reset failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
