// Development seed. Run intentionally:
//   npm run seed        -> plans, settings, admin (from .env) and company listings
//   npm run seed:demo   -> the above plus demo agents, customers, listings and inquiries
// Safe to re-run: existing plans, listings and accounts are skipped, never duplicated.
import "dotenv/config";
import fs from "fs";
import mongoose from "mongoose";
import connectDB from "../config/mongodb.js";
import Plan from "../models/Plan.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Subscription from "../models/Subscription.js";
import Inquiry from "../models/Inquiry.js";
import Setting, { getSettings } from "../models/Setting.js";
import { ensureAdmin } from "../utils/ensureAdmin.js";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const withDemo = process.argv.includes("--demo");

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

const seedCompanyListings = async () => {
  const admin = await User.findOne({ role: "admin" });
  if (!admin) return console.log("  ! no admin account, skipping company listings");
  if (await Property.exists({ ownerType: "admin" })) return;
  const listings = JSON.parse(fs.readFileSync(new URL("./companyListings.json", import.meta.url)));
  await Property.insertMany(
    listings.map((l, i) => ({ ...l, owner: admin._id, ownerType: "admin", status: "published", createdAt: daysAgo(170 - i * 13) }))
  );
  console.log(`  + ${listings.length} company listings`);
};

// ---------- Demo data (only with --demo) ----------

const DEMO_PASSWORD = "password123";

const demoAccount = async ({ firstName, lastName, email, phone, createdDaysAgo }) => {
  const existing = await User.findOne({ email });
  if (existing) return { user: existing, created: false };
  const user = await User.create({ firstName, lastName, email, phone, password: DEMO_PASSWORD, createdAt: daysAgo(createdDaysAgo) });
  return { user, created: true };
};

const giveSubscription = async (user, planName, startedDaysAgo, overrides = {}) => {
  const plan = await Plan.findOne({ name: planName });
  const start = daysAgo(startedDaysAgo);
  const subscription = await Subscription.create({
    user: user._id,
    plan: plan._id,
    planName: plan.name,
    amount: plan.price,
    paymentReference: `HB-DEMO-${user.email.split("@")[0].toUpperCase()}-${startedDaysAgo}`,
    paymentMethod: "MTN MoMo",
    status: "active",
    paymentStatus: "paid",
    startDate: start,
    expiresAt: new Date(start.getTime() + plan.duration * DAY),
    paidAt: start,
    createdAt: start,
    ...overrides,
  });
  user.role = "agent";
  user.subscription = subscription._id;
  await user.save();
};

const demoProperty = (owner, data) => ({
  ownerType: "agent",
  owner: owner._id,
  contact: { id: String(owner._id), name: `${owner.firstName} ${owner.lastName}`, phone: owner.phone, email: owner.email },
  ...data,
  location: { city: "Accra", region: "Greater Accra", ...data.location },
});

const seedDemo = async () => {
  const kwame = await demoAccount({ firstName: "Kwame", lastName: "Asante", email: "agent@homebase.com", phone: "+233 24 555 0101", createdDaysAgo: 200 });
  const yaw = await demoAccount({ firstName: "Yaw", lastName: "Mensah", email: "starter@homebase.com", phone: "+233 50 321 7788", createdDaysAgo: 45 });
  const adwoa = await demoAccount({ firstName: "Adwoa", lastName: "Boakye", email: "premium@homebase.com", phone: "+233 26 909 1212", createdDaysAgo: 110 });
  const efua = await demoAccount({ firstName: "Efua", lastName: "Mensah", email: "expired@homebase.com", phone: "+233 27 888 4455", createdDaysAgo: 150 });
  const ama = await demoAccount({ firstName: "Ama", lastName: "Owusu", email: "user@homebase.com", phone: "+233 20 111 2233", createdDaysAgo: 120 });
  const kofi = await demoAccount({ firstName: "Kofi", lastName: "Tetteh", email: "kofi@example.com", phone: "+233 24 781 3321", createdDaysAgo: 3 });

  if (kwame.created) {
    await giveSubscription(kwame.user, "Professional", 24);
    await Property.insertMany([
      demoProperty(kwame.user, {
        title: "The Palm Grove Residence", listingType: "Sale", propertyType: "Family-Home", price: 520000, pricePeriod: "total",
        description: "A bright four-bedroom family home on a quiet, tree-lined street in Tse Addo with a covered terrace, private garden, solar backup, borehole and a two-car garage.",
        location: { neighbourhood: "Tse Addo", address: "7 Palm Grove Close" }, bedrooms: 4, bathrooms: 3.5, area: 310,
        amenities: ["Garden", "Solar Backup", "Borehole", "Garage"], images: ["/properties/house_8.jpg"], status: "published", views: 842, rating: 4.6,
      }),
      demoProperty(kwame.user, {
        title: "Cantonments Garden Apartment", listingType: "Rent", propertyType: "Apartment", price: 3500, pricePeriod: "month",
        description: "A modern two-bedroom apartment in a secure, gated block minutes from the embassies, with a balcony, shared pool, gym and 24/7 security.",
        location: { neighbourhood: "Cantonments", address: "22 Embassy Road" }, bedrooms: 2, bathrooms: 2, area: 120,
        amenities: ["Swimming Pool", "Gym", "24/7 Security", "Balcony"], images: ["/properties/house10.jpg", "/properties/twoBedRoomImg.jpg"], status: "published", availability: "Under Offer", views: 1310, rating: 4.4,
      }),
      demoProperty(kwame.user, {
        title: "Spintex Modern Townhouse", listingType: "Sale", propertyType: "Townhouse", price: 395000, pricePeriod: "total",
        description: "A newly completed three-bedroom townhouse in a gated Spintex community with a rooftop terrace and two parking spaces, close to schools and the Accra Mall.",
        location: { neighbourhood: "Spintex", address: "18 Coastal Estate Drive" }, bedrooms: 3, bathrooms: 3, area: 190,
        amenities: ["Roof Terrace", "Parking", "24/7 Security"], images: ["/properties/house7_2.jpg", "/properties/house7_3.jpg"], status: "pending",
      }),
    ]);
  }

  if (yaw.created) {
    await giveSubscription(yaw.user, "Starter", 12);
    const rows = [
      ["Madina Family Duplex", "Duplex", "Sale", 330000, "total", "Madina", "/properties/house1.jpg", 4, 3, 210, 390],
      ["Achimota Two-Bed Flat", "Apartment", "Rent", 2200, "month", "Achimota", "/properties/oneBedRoomImg.jpg", 2, 1, 85, 510],
      ["Haatso Courtyard House", "Single", "Sale", 265000, "total", "Haatso", "/properties/house2.jpg", 3, 2, 150, 220],
      ["Dome Pillar 2 Studio", "Studio", "Rent", 1400, "month", "Dome", "/properties/house3.jpg", 1, 1, 45, 180],
    ];
    await Property.insertMany([
      ...rows.map(([title, type, listing, price, period, area, img, beds, baths, size, views]) =>
        demoProperty(yaw.user, {
          title, propertyType: type, listingType: listing, price, pricePeriod: period,
          description: `A well-kept ${type.toLowerCase()} in ${area} with easy access to main roads, markets and schools. Viewings on weekdays and Saturdays.`,
          location: { neighbourhood: area, address: `12 ${area} Road` }, bedrooms: beds, bathrooms: baths, area: size,
          amenities: ["Parking", "Walled Compound"], images: [img], status: "published", views,
        })
      ),
      demoProperty(yaw.user, {
        title: "Adenta Housing Down Bungalow", propertyType: "Bungalow", listingType: "Sale", price: 240000, pricePeriod: "total",
        description: "A three-bedroom bungalow with a large compound and fruit trees, close to the Adenta barrier and local schools.",
        location: { neighbourhood: "Adenta", address: "5 Housing Down Lane" }, bedrooms: 3, bathrooms: 2, area: 140,
        amenities: ["Garden", "Parking"], images: ["/properties/house6.jpg"], status: "pending",
      }),
    ]);
  }

  if (adwoa.created) {
    await giveSubscription(adwoa.user, "Premium", 100, { paymentMethod: "Card" });
    await Property.insertMany([
      demoProperty(adwoa.user, {
        title: "Labone Skyline Penthouse", propertyType: "Penthouse", listingType: "Sale", price: 1450000, pricePeriod: "total",
        description: "A striking top-floor penthouse with a wraparound terrace overlooking the Accra skyline, four ensuite bedrooms and private lift access.",
        location: { neighbourhood: "Labone", address: "1 Skyline Towers" }, bedrooms: 4, bathrooms: 4.5, area: 420,
        amenities: ["Swimming Pool", "Gym", "Elevator", "Air Conditioning"], images: ["/properties/penthouseImg.jpg", "/properties/house11.jpg"], status: "published", isFeatured: true, views: 2640, rating: 4.9,
      }),
      demoProperty(adwoa.user, {
        title: "Trasacco Garden Villa", propertyType: "Luxury-Villa", listingType: "Sale", price: 2100, pricePeriod: "total",
        description: "Five-bedroom villa in Trasacco Valley with pool and staff quarters, landscaped gardens and a gated entrance.",
        location: { neighbourhood: "Trasacco Valley", address: "9 Valley View" }, bedrooms: 5, bathrooms: 5, area: 520,
        amenities: ["Swimming Pool", "Staff Quarters"], images: ["/properties/house9.jpg"], status: "rejected",
        rejectionReason: "The sale price looks incorrect and the photos don't show the interior. Please update and resubmit.",
      }),
    ]);
  }

  if (efua.created) {
    await giveSubscription(efua.user, "Starter", 37); // expired a week ago
    await Property.create(
      demoProperty(efua.user, {
        title: "Takoradi Harbour View Villa", propertyType: "Villa", listingType: "Sale", price: 610000, pricePeriod: "total",
        description: "A spacious five-bedroom villa on the hill above Takoradi harbour with sea views from every upstairs room.",
        location: { neighbourhood: "Takoradi", city: "Takoradi", region: "Western", address: "3 Harbour Heights" }, bedrooms: 5, bathrooms: 4, area: 380,
        amenities: ["Sea View", "Garden"], images: ["/properties/house4.jpg"], status: "published", views: 460,
      })
    );
  }

  if (!(await Inquiry.exists({}))) {
    const palm = await Property.findOne({ title: "The Palm Grove Residence" });
    const flat = await Property.findOne({ title: "Cantonments Garden Apartment" });
    const duplex = await Property.findOne({ title: "Madina Family Duplex" });
    const company = await Property.findOne({ ownerType: "admin" });
    const inquiry = (property, customer, name, email, phone, message, status, ago) =>
      property && {
        property: property._id, agent: property.ownerType === "agent" ? property.owner : null, ownerType: property.ownerType,
        customer: customer?._id || null, name, email, phone, message, status, createdAt: daysAgo(ago),
      };
    await Inquiry.insertMany(
      [
        inquiry(palm, null, "Yaw Boateng", "yaw.boateng@example.com", "+233 24 301 2299", "Is the price negotiable? I'd like to arrange a viewing this weekend.", "new", 0),
        inquiry(flat, ama.user, "Ama Owusu", ama.user.email, ama.user.phone, "Is the apartment available from next month? I'd need a one-year lease.", "new", 1),
        inquiry(palm, null, "Nana Adjei", "nana.adjei@example.com", "+233 55 789 4410", "Does the sale include the solar system?", "inProgress", 4),
        inquiry(duplex, kofi.user, "Kofi Tetteh", kofi.user.email, kofi.user.phone, "Is there space to extend the duplex? We're a family of six.", "new", 1),
        inquiry(company, ama.user, "Ama Owusu", ama.user.email, ama.user.phone, "Could someone call me about financing options?", "contacted", 6),
      ].filter(Boolean)
    );
    console.log("  + demo inquiries");
  }
  console.log(`  demo accounts ready (password: ${DEMO_PASSWORD})`);
};

try {
  await connectDB();
  console.log("Seeding...");
  await ensureAdmin();
  await seedPlans();
  await seedSettings();
  await seedCompanyListings();
  if (withDemo) await seedDemo();
  console.log("Done.");
} catch (error) {
  console.error("Seed failed:", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
