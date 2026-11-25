const PRESENTATIONS = {
  apartment: { label: 'Apartments', description: 'Easy everyday living, with a space of your own.', icon: 'building', image: '/hero/modern-living-960.jpg', rank: 0 },
  villa: { label: 'Villas', description: 'Room to unwind, inside and out.', icon: 'home', image: '/agentBg.jpg', rank: 1 },
  'family-home': { label: 'Family homes', description: 'Space for shared moments and new memories.', icon: 'home', image: '/banners/listings-suburb-960.jpg', rank: 2 },
  townhouse: { label: 'Townhouses', description: 'Your own front door, with a neighbourhood around you.', icon: 'building', image: '/banners/listings-suburb-960.jpg', rank: 3 },
  penthouse: { label: 'Penthouses', description: 'A different perspective on city living.', icon: 'tower', image: '/properties/penthouseImg.jpg', rank: 4 },
  'hotel-apartment': { label: 'Hotel apartments', description: 'A furnished base for a little while or a longer stay.', icon: 'hotel', image: '/hero/resort-pool-960.jpg', rank: 5 },
  bungalow: { label: 'Bungalows', description: 'Single-level spaces with room to settle in.', icon: 'home', image: '/banners/listings-suburb-960.jpg', rank: 6 },
  duplex: { label: 'Duplexes', description: 'Explore homes with room across two levels.', icon: 'building', image: '/agentBg.jpg', rank: 7 },
  'luxury-villa': { label: 'Luxury villas', description: 'Distinctive spaces for your next chapter.', icon: 'home', image: '/agentBg.jpg', rank: 8 },
  'modern-home': { label: 'Modern homes', description: 'Contemporary spaces for the way you live.', icon: 'home', image: '/agentBg.jpg', rank: 9 },
  studio: { label: 'Studios', description: 'Compact spaces with plenty of possibility.', icon: 'bed', image: '/hero/furnished-bedroom-960.jpg', rank: 10 },
  manor: { label: 'Manors', description: 'Generous homes with a character of their own.', icon: 'home', image: '/hero/heritage-villa-960.jpg', rank: 11 },
  single: { label: 'Single rooms', description: 'A simple space to make your own.', icon: 'bed', image: '/hero/furnished-bedroom-960.jpg', rank: 12 },
  hotel: { label: 'Hotels', description: 'Explore places made for a welcoming stay.', icon: 'hotel', image: '/hero/resort-pool-960.jpg', rank: 13 },
};

const keyOf = (value) => value.trim().toLowerCase();

// Names stay tied to Admin Settings and public facets; counts are never placeholders.
// Reuse already-loaded public property images, then fall back to editorial category imagery.
export const buildPropertyCategories = (configured = [], facets, properties = []) => {
  const types = new Map();
  configured.filter(Boolean).forEach((value) => types.set(keyOf(value), value.trim()));
  const counts = facets ? new Map() : null;
  facets?.forEach(({ value, count }) => {
    if (!value) return;
    const key = keyOf(value);
    if (!types.has(key)) types.set(key, value.trim());
    counts.set(key, (counts.get(key) || 0) + count);
  });
  const images = new Map();
  properties.forEach((property) => {
    const type = property.property?.type;
    const image = property.media?.images?.[0];
    if (type && image && !images.has(keyOf(type))) images.set(keyOf(type), image);
  });
  return [...types].map(([key, value]) => {
    const presentation = PRESENTATIONS[key.replace(/[ _]+/g, '-')] || {
      label: value.replace(/-/g, ' '), description: 'Discover available spaces in this property style.', icon: 'building', image: '', rank: 100,
    };
    return { ...presentation, value, count: counts ? counts.get(key) || 0 : null, image: images.get(key) || presentation.image };
  }).sort((a, b) => (b.count || 0) - (a.count || 0) || a.rank - b.rank || a.label.localeCompare(b.label));
};

export const propertyCategoryHref = (listingsPath, type) => `${listingsPath}?${new URLSearchParams({ type })}`;

// Older homepage and shared search links retain their filters when Properties becomes a hub.
const SEARCH_KEYS = ['status', 'stay', 'type', 'area', 'minPrice', 'maxPrice', 'bedrooms', 'bathrooms', 'availability', 'search', 'sort', 'page'];
export const propertyDiscoveryRedirect = (listingsPath, search, hash = '') => {
  const params = new URLSearchParams(search);
  return SEARCH_KEYS.some((key) => params.has(key)) ? `${listingsPath}${search}${hash}` : null;
};
