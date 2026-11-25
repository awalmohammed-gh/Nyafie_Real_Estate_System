// The listings page's tabs. Rent is a home to live in (by the month or a fixed price); anything by the
// night is a short stay. Prices are only compared within a tab: a night, a month and a sale aren't alike.
export const tabOf = ({ listingType, stay }) => (stay ? "stay" : listingType || "");

// What the server is asked for. allRentals: a location page (/rent/osu) lists every rental there
export const tabQuery = (tab, { allRentals = false } = {}) => ({
  listingType: tab === "stay" ? undefined : tab || undefined,
  stay: tab === "stay" ? "true" : tab === "Rent" && !allRentals ? "false" : undefined,
});
export const tabFacets = (tab, { allRentals = false } = {}) => (tab === "Rent" && allRentals ? "RentAll" : tab);
export const tabCount = (facets, tab) => facets && { "": facets.total, Sale: facets.sale, Rent: facets.rentHomes ?? facets.rent, stay: facets.stays }[tab];

const money = (value) => `₵${value.toLocaleString()}`;
const upTo = (max) => ({ label: `Up to ${money(max)}`, min: 0, max });
const between = (min, max) => ({ label: `${money(min)} – ${money(max)}`, min, max });
const over = (max) => ({ label: `Over ${money(max)}`, min: max + 1, max: null });
const RANGES = {
  Sale: [upTo(200000), between(200001, 400000), between(400001, 700000), between(700001, 1500000), over(1500000)],
  Rent: [upTo(1000), between(1001, 2000), between(2001, 5000), between(5001, 10000), over(10000)],
  stay: [upTo(300), between(301, 600), between(601, 1200), between(1201, 2500), over(2500)],
};
export const priceRanges = (tab) => RANGES[tab] || [];
export const priceUnit = (tab) => ({ Sale: "to buy", Rent: "per month", stay: "per night" }[tab] || "");
export const priceLabel = (tab, min, max) => priceRanges(tab).find((range) => range.min === (min ?? 0) && range.max === max)?.label
  || (max === null ? `From ${money(min || 0)}` : min === null ? `Up to ${money(max)}` : `${money(min)} – ${money(max)}`);

const PRICE_SORTS = ["priceAsc", "priceDesc"];
export const sortsFor = (tab, sorts) => (tab ? sorts : sorts.filter(({ value }) => !PRICE_SORTS.includes(value)));
