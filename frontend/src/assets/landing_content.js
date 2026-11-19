// Homepage marketing copy: hero slides and generic floor-plan types.
// Not property data: every listing comes from MongoDB through the API.

import heroBedroom from "./hero/hero-furnished-bedroom.jpg"
import heroResort from "./hero/hero-resort-pool.jpg"
import heroHeritage from "./hero/hero-heritage-villa.jpg"
import heroLiving from "./hero/hero-modern-living.jpg"

import apartImg1 from "./studioPlanImg.jpg"
import apartImg2 from "./oneBedRoomImg.jpg"
import apartImg3 from "./twoBedRoomImg.jpg"
import apartImg4 from "./3bedRoomImg.jpg"
import apartImg5 from "./duplexImg.jpg"
import apartImg6 from "./penthouseImg.jpg"

// Each slide links to an existing listing page: a fixed path (to) or a page whose URL is set in Admin Settings (page)
export const heroContent = [
  {
    eyebrow: "Move-in ready rentals",
    title: "Rooms that feel like home from day one",
    description:
      "Furnished apartments and serviced homes for rent across Ghana. See real photos, check availability, then rent and pay securely online.",
    highlights: ["Furnished options", "Listings reviewed before publishing", "Secure online payment"],
    cta: { label: "Browse rentals", to: "/rent" },
    image: heroBedroom,
  },
  {
    eyebrow: "Resort-style living",
    title: "Poolside mornings, palm-lined evenings",
    description:
      "Apartments and holiday homes in gated communities with pools, gardens and round-the-clock security, for weekend escapes or everyday calm.",
    highlights: ["Pools & gardens", "Gated communities", "Nightly and monthly stays"],
    cta: { label: "Explore properties", page: "properties" },
    image: heroResort,
  },
  {
    eyebrow: "Homes for sale",
    title: "Own a landmark home with character",
    description:
      "From restored heritage houses to grand family villas. Request to buy, then agree the viewing, documents and payment directly with the owner.",
    highlights: ["Heritage & luxury homes", "Guided viewings", "Agree payment with the owner"],
    cta: { label: "View homes for sale", to: "/sale" },
    image: heroHeritage,
  },
  {
    eyebrow: "Modern apartments",
    title: "Bright, open spaces made for living",
    description:
      "Open-plan living rooms, clean finishes and plenty of natural light. Compare prices, save favourites to your wishlist and chat directly with owners.",
    highlights: ["Save to your wishlist", "Chat with owners", "Make an offer online"],
    cta: { label: "Browse all listings", page: "listings" },
    image: heroLiving,
  },
];

export const apartmentPlans = [
  {
    title: "Studio Apartment",
    description: "A compact and efficient open-plan layout that combines the bedroom, living area, and kitchen into one space. Ideal for singles, students, or young professionals who want a simple and affordable living option.",
    features: ["Open space", "1 bathroom", "Kitchenette"],
    size: "25–45 sqm",
    image: apartImg1
  },
  {
    title: "1-Bedroom Apartment",
    description: "A comfortable layout with a separate bedroom and living area, offering more privacy and better space organization. Perfect for individuals or couples looking for a balance between affordability and comfort.",
    features: ["1 bedroom", "Living room", "Kitchen", "1 bathroom"],
    size: "45–70 sqm",
    image: apartImg2
  },
  {
    title: "2-Bedroom Apartment",
    description: "A practical choice for small families or shared living, featuring two bedrooms and a spacious living area. It provides enough room for comfort while still being easy to maintain.",
    features: ["2 bedrooms", "Living & dining", "1–2 bathrooms", "Kitchen"],
    size: "70–100 sqm",
    image: apartImg3
  },
  {
    title: "3-Bedroom Apartment",
    description: "A spacious and family-friendly layout designed for comfort and convenience. It includes multiple bedrooms, a larger living space, and often a master ensuite for added privacy.",
    features: ["3 bedrooms", "Master ensuite", "Dining area", "2–3 bathrooms"],
    size: "100–150 sqm",
    image: apartImg4
  },
  {
    title: "Duplex Apartment",
    description: "A modern two-level apartment that separates living and sleeping areas across floors. It offers a house-like feel with more space, privacy, and a stylish layout.",
    features: ["2 floors", "Multiple bedrooms", "Living room", "Balcony"],
    size: "120–180 sqm",
    image: apartImg5
  },
  {
    title: "Penthouse Apartment",
    description: "A luxury top-floor apartment designed for premium living, featuring large spaces, high-end finishes, and often a private terrace with great views.",
    features: ["3–5 bedrooms", "Terrace", "Modern kitchen", "Multiple bathrooms"],
    size: "150+ sqm",
    image: apartImg6
  }
];
