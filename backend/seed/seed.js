// Initial data. Run intentionally with: npm run seed
//   -> plans, settings, the admin account (from ADMIN_EMAIL / ADMIN_PSD) and the NyaFie company listings.
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

// Plans per account type. Starter plans have no NyaFie chat (inquiries, phone, email and WhatsApp still work).
const plans = [
  {
    name: "Starter", accountType: "individual",
    tagline: "For independent agents and owners getting their first listings online",
    price: 150, duration: 30, propertyLimit: 5, imageLimit: 2, featuredPropertyLimit: 0,
    analyticsLevel: "basic", inquiryManagement: "basic", internalChat: false, priorityVisibility: false,
    features: ["Agent profile page", "Email support"], popular: false,
  },
  {
    name: "Professional", accountType: "individual",
    tagline: "For serious independent agents who list every month",
    price: 400, duration: 90, propertyLimit: 20, imageLimit: 15, featuredPropertyLimit: 3,
    analyticsLevel: "advanced", inquiryManagement: "full", internalChat: true, priorityVisibility: true,
    features: ["Agent profile page", "Priority support"], popular: true,
  },
  {
    name: "Agency Starter", accountType: "agency",
    tagline: "For small agencies building their presence",
    price: 600, duration: 30, propertyLimit: 25, imageLimit: 5, featuredPropertyLimit: 2, teamMemberLimit: 3,
    analyticsLevel: "standard", inquiryManagement: "full", internalChat: false, priorityVisibility: false,
    features: ["Company profile and logo", "Email support"], popular: false,
  },
  {
    name: "Agency Business", accountType: "agency",
    tagline: "For established agencies and property companies",
    price: 1500, duration: 90, propertyLimit: 100, imageLimit: 20, featuredPropertyLimit: 10, teamMemberLimit: 15,
    analyticsLevel: "advanced", inquiryManagement: "full", internalChat: true, priorityVisibility: true,
    features: ["Company profile and logo", "Dedicated account manager"], popular: true,
  },
  // Company plans: larger organisations (developers, property managers, hotel and property operators)
  {
    name: "Company Starter", accountType: "company", sortOrder: 1,
    tagline: "For registered property businesses getting started on NyaFie",
    price: 2000, duration: 30, propertyLimit: 50, imageLimit: 15, featuredPropertyLimit: 5, teamMemberLimit: 5,
    analyticsLevel: "advanced", inquiryManagement: "full", internalChat: true, priorityVisibility: false,
    features: ["Company profile and logo", "Email support"], popular: false,
  },
  {
    name: "Company Growth", accountType: "company", sortOrder: 2,
    tagline: "For growing developers and property management firms",
    price: 5000, duration: 90, propertyLimit: 150, imageLimit: 15, featuredPropertyLimit: 15, teamMemberLimit: 15,
    analyticsLevel: "advanced", inquiryManagement: "full", internalChat: true, priorityVisibility: true,
    features: ["Company profile and logo", "Priority support"], popular: true,
  },
  {
    name: "Company Pro", accountType: "company", sortOrder: 3,
    tagline: "For large property companies and operators",
    price: 15000, duration: 365, propertyLimit: 500, imageLimit: 15, featuredPropertyLimit: 40, teamMemberLimit: 40,
    analyticsLevel: "advanced", inquiryManagement: "full", internalChat: true, priorityVisibility: true,
    features: ["Company profile and logo", "Dedicated account manager"], popular: false,
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

// Company listings belong to the admin account and show NyaFie's public contact details
const seedCompanyListings = async () => {
  // The first admin account (created by ensureAdmin from ADMIN_EMAIL / ADMIN_PSD)
  const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
  if (!admin) return console.log("  ! no admin account (set ADMIN_EMAIL / ADMIN_PSD), skipping company listings");
  const { general, contact: business } = await getSettings();
  const contact = { id: "nyafie", name: general.siteName, phone: business.phone, email: business.email };

  const listings = JSON.parse(fs.readFileSync(new URL("./companyListings.json", import.meta.url)));
  let added = 0;
  for (const [i, listing] of listings.entries()) {
    if (await Property.exists({ ownerType: "admin", title: listing.title })) continue;
    await Property.create({ ...listing, contact, owner: admin._id, ownerType: "admin", status: "published", createdAt: daysAgo(170 - i * 13) });
    added++;
  }
  if (added) console.log(`  + ${added} company listings`);

  // Admin-owned listings always carry the NyaFie contact, never a person's
  const fixed = await Property.updateMany({ ownerType: "admin", "contact.id": { $ne: "nyafie" } }, { $set: { contact } });
  if (fixed.modifiedCount) console.log(`  ~ ${fixed.modifiedCount} company listings now use the NyaFie contact`);
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
