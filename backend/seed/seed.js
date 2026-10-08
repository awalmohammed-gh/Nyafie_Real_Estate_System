// Initial data. Run intentionally with: npm run seed
//   -> plans, settings, the admin account (from ADMIN_EMAIL / ADMIN_PSD) and the HomeBase company listings.
// Safe to re-run: plans and listings that already exist are skipped, never duplicated.
// No customer or agent accounts are created here: real users sign up through the app.
import "dotenv/config";
import fs from "fs";
import mongoose from "mongoose";
import connectDB from "../config/mongodb.js";
import Plan from "../models/Plan.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Setting, { getSettings } from "../models/Setting.js";
import { ensureAdmin } from "../utils/ensureAdmin.js";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);

const plans = [
  {
    name: "Starter",
    tagline: "For new agents getting their first listings online",
    price: 150, duration: 30, propertyLimit: 5, imageLimit: 5, featuredPropertyLimit: 0,
    analyticsLevel: "basic", inquiryManagement: "basic", priorityVisibility: false,
    features: ["Agent profile page", "Email support"], popular: false,
  },
  {
    name: "Professional",
    tagline: "For growing agents who list every month",
    price: 400, duration: 90, propertyLimit: 20, imageLimit: 10, featuredPropertyLimit: 3,
    analyticsLevel: "standard", inquiryManagement: "full", priorityVisibility: false,
    features: ["Agent profile page", "Priority support"], popular: true,
  },
  {
    name: "Premium",
    tagline: "For established agencies and top producers",
    price: 1400, duration: 365, propertyLimit: 50, imageLimit: 15, featuredPropertyLimit: 10,
    analyticsLevel: "advanced", inquiryManagement: "full", priorityVisibility: true,
    features: ["Homepage spotlight rotation", "Dedicated account manager"], popular: false,
  },
];

const seedPlans = async () => {
  for (const plan of plans) {
    if (await Plan.exists({ name: plan.name })) continue;
    await Plan.create(plan);
    console.log(`  + plan ${plan.name}`);
  }
};

const seedSettings = async () => {
  await getSettings(); // creates the settings document with defaults
  const starter = await Plan.findOne({ name: "Starter" });
  const doc = await Setting.findOne({ key: "platform" });
  if (starter && !doc.agent?.defaultPlan) {
    await Setting.updateOne({ key: "platform" }, { $set: { agent: { ...doc.agent, defaultPlan: String(starter._id) } } });
  }
};

// Company listings belong to the admin account and show HomeBase's public contact details
const seedCompanyListings = async () => {
  // The first admin account (created by ensureAdmin from ADMIN_EMAIL / ADMIN_PSD)
  const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
  if (!admin) return console.log("  ! no admin account (set ADMIN_EMAIL / ADMIN_PSD), skipping company listings");
  const { general, contact: business } = await getSettings();
  const contact = { id: "homebase", name: general.siteName, phone: business.phone, email: business.email };

  const listings = JSON.parse(fs.readFileSync(new URL("./companyListings.json", import.meta.url)));
  let added = 0;
  for (const [i, listing] of listings.entries()) {
    if (await Property.exists({ ownerType: "admin", title: listing.title })) continue;
    await Property.create({ ...listing, contact, owner: admin._id, ownerType: "admin", status: "published", createdAt: daysAgo(170 - i * 13) });
    added++;
  }
  if (added) console.log(`  + ${added} company listings`);

  // Admin-owned listings always carry the HomeBase contact, never a person's
  const fixed = await Property.updateMany({ ownerType: "admin", "contact.id": { $ne: "homebase" } }, { $set: { contact } });
  if (fixed.modifiedCount) console.log(`  ~ ${fixed.modifiedCount} company listings now use the HomeBase contact`);
};

try {
  await connectDB();
  console.log("Seeding...");
  await ensureAdmin();
  await seedPlans();
  await seedSettings();
  await seedCompanyListings();
  console.log("Done.");
} catch (error) {
  console.error("Seed failed:", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
