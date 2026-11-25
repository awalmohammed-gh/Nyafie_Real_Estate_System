export const ROW_SIZE = 4;

// Up to four homes for a row: ones the visitor hasn't seen higher up first. A single home already
// shown above isn't worth a row of its own.
export const pickRow = (items, seen) => {
  const fresh = items.filter((item) => !seen.has(item.id));
  if (!fresh.length && items.length < 2) return [];
  return [...fresh, ...items.filter((item) => seen.has(item.id))].slice(0, ROW_SIZE);
};

/**
 * The home page's rows from GET /properties/home, in order: { lead, rows }.
 * lead is the first row on the page. "Featured" is used only when homes are really featured.
 */
export const homeRows = (data) => {
  const { featured = [], latest = [], sale = [], rent = [], stays = [] } = data?.rows || {};
  const seen = new Set();
  const row = (id, items) => {
    const picked = pickRow(items, seen);
    picked.forEach((item) => seen.add(item.id));
    return { id, items: picked };
  };
  const hasFeatured = featured.length >= 2;
  const lead = row(hasFeatured ? "featured" : "latest", hasFeatured ? featured : latest);
  const rows = [row("sale", sale), row("rent", rent), row("stays", stays)];
  // Under featured homes, the newest ones come last, once there are enough not shown above
  if (hasFeatured && latest.filter((item) => !seen.has(item.id)).length >= 2) rows.push(row("latest", latest));
  const sameAsLead = ({ items }) => items.length === lead.items.length && items.every((item) => lead.items.includes(item));
  return { lead, rows: rows.filter((entry) => entry.items.length && !sameAsLead(entry)) };
};

const LAND = /^(land|plot)/i;
export const landTypes = (types = []) => types.filter((type) => LAND.test(type.value));
export const countOf = (types, match) => types.filter((type) => match.test(type.value)).reduce((sum, type) => sum + type.count, 0);

// Places worth offering on the home page: neighbourhoods with a photo first, the most homes first
export const homeAreas = (facets, count = 6) => (facets?.areas || []).filter((area) => area.image).slice(0, count);

export const homesLabel = (count) => `${count.toLocaleString()} ${count === 1 ? "home" : "homes"}`;
