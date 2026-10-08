// Wording for the listings banner, built from the active filters

const lowerFirst = (text) => (/^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text);

/**
 * The banner heading for the active filters, e.g. "Apartment listings to rent in Accra".
 * Each filter is { kind: intent|type|area|price|beds|baths|availability|search, value, label }.
 */
export const bannerHeading = (filters, fallback) => {
  if (!filters.length) return fallback;
  const types = filters.filter((f) => f.kind === "type");
  const intent = filters.find((f) => f.kind === "intent");
  const area = filters.find((f) => f.kind === "area") || filters.find((f) => f.kind === "city") || filters.find((f) => f.kind === "region");

  if (types.length === 1 || intent || area) {
    let heading = types.length === 1 ? `${types[0].label} listings`
      : intent?.value === "Rent" ? "Rental listings"
        : intent?.value === "Sale" ? "Homes for sale"
          : "Properties";
    if (types.length === 1 && intent) heading += intent.value === "Rent" ? " to rent" : " for sale";
    if (area) heading += ` in ${area.label}`;
    return heading;
  }
  if (filters.length === 1) {
    const [only] = filters;
    const single = {
      price: `Homes priced ${lowerFirst(only.label)}`,
      beds: `Homes with ${only.value}+ bedrooms`,
      baths: `Homes with ${only.value}+ bathrooms`,
      availability: only.value === "Available" ? "Available listings" : "Listings under offer",
      search: `Results for ${only.label}`,
    };
    if (single[only.kind]) return single[only.kind];
  }
  return "Filtered listings";
};
