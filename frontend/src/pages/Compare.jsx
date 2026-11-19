import { Link } from "react-router-dom";
import { BadgeCheck, GitCompareArrows, Star, X } from "lucide-react";
import EmptyState from "../components/ui/EmptyState";
import PageLoader from "../components/ui/PageLoader";
import { propertyApi } from "../frontApi";
import { useApiQuery } from "../hooks/useApiQuery";
import { useBrowsingList } from "../hooks/useBrowsingList";
import { usePlatform } from "../context/usePlatform";
import { COMPARE_KEY, COMPARE_LIMIT, clearCompare, inOrder, toggleCompare } from "../utils/browsingLists";
import { formatLocation, formatType, getPriceParts, statusLabel } from "../utils/property";
import { formatDate } from "../utils/date";
import { embedUrl } from "../utils/mediaLinks";
import { cloudImage } from "../utils/cloudImage";

const yes = (value) => (value ? "Yes" : "–");
const amount = (p) => p.pricing.amount ?? p.pricing.perMonth ?? p.pricing.perNight ?? null;
// Price per square metre: comparable only for homes for sale with a floor area
const perSqm = (p) => {
  const size = p.property.size?.value;
  return p.property.status === "Sale" && size > 0 && amount(p) ? `₵${Math.round(amount(p) / size).toLocaleString()} / m²` : "–";
};

// Each row: a label and what to show for one home. `best` marks the lowest/highest value worth noticing.
const ROWS = [
  { label: "Price", value: (p) => { const { value, period } = getPriceParts(p); return `${value}${period || ""}`; }, best: { pick: "min", of: amount } },
  { label: "Listing", value: (p) => statusLabel(p.property.status) },
  { label: "Type", value: (p) => formatType(p.property.type || "") },
  { label: "Bedrooms", value: (p) => p.property.bedrooms ?? "–", best: { pick: "max", of: (p) => p.property.bedrooms } },
  { label: "Bathrooms", value: (p) => p.property.bathrooms ?? "–", best: { pick: "max", of: (p) => p.property.bathrooms } },
  { label: "Floor area", value: (p) => (p.property.size?.value ? `${p.property.size.value} ${p.property.size.unit}` : "–"), best: { pick: "max", of: (p) => p.property.size?.value } },
  { label: "Price per m²", value: perSqm, best: { pick: "min", of: (p) => (perSqm(p) === "–" ? null : amount(p) / p.property.size.value) } },
  { label: "Location", value: (p) => formatLocation(p.location) || "–" },
  { label: "Availability", value: (p) => p.listing.availability },
  { label: "Documents checked", value: (p) => (p.listing.documentsVerifiedAt ? <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck className="h-4 w-4" aria-hidden="true" />Yes</span> : "–") },
  { label: "Video or 3D tour", value: (p) => yes(embedUrl(p.media.video) || embedUrl(p.media.virtualTour)) },
  { label: "Rating", value: (p) => (p.meta.rating ? <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />{p.meta.rating.toFixed(1)} ({p.meta.ratingCount})</span> : "–") },
  { label: "Amenities", value: (p) => (p.features.length ? p.features.join(", ") : "–") },
  { label: "Listed", value: (p) => (p.listing.createdAt ? formatDate(p.listing.createdAt) : "–") },
];

// The column(s) holding the best value of a row, when the homes differ
const winners = (row, homes) => {
  if (!row.best || homes.length < 2) return new Set();
  const values = homes.map((p) => Number(row.best.of(p))).map((v) => (Number.isFinite(v) && v > 0 ? v : null));
  const present = values.filter((v) => v !== null);
  if (present.length < 2 || new Set(present).size < 2) return new Set();
  const target = row.best.pick === "min" ? Math.min(...present) : Math.max(...present);
  return new Set(values.flatMap((v, i) => (v === target ? [i] : [])));
};

const Compare = () => {
  const { paths } = usePlatform();
  const ids = useBrowsingList(COMPARE_KEY);
  const query = useApiQuery(ids.length ? `compare:${ids.join(",")}` : null, (signal) => propertyApi.searchProperties({ ids: ids.join(","), limit: COMPARE_LIMIT }, { signal }));
  const homes = inOrder(ids, query.data?.items || []);

  if (ids.length && query.loading) return <PageLoader label="Loading homes..." />;
  return (
    <div className="container-page py-10 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-brand-700 uppercase">Side by side</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">Compare homes</h1>
          <p className="mt-1 text-sm text-gray-500">Up to {COMPARE_LIMIT} homes. Add them with “Compare” on any listing. The best value in each row is highlighted.</p>
        </div>
        {homes.length > 0 && <button type="button" onClick={clearCompare} className="btn btn-light">Clear all</button>}
      </div>

      {query.error ? (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{query.error}</p>
      ) : !homes.length ? (
        <EmptyState icon={GitCompareArrows} title="No homes to compare yet" description="Open a listing and choose “Compare” to add it here. Pick two or three to see them side by side." action={<Link to={paths.listings} className="btn btn-primary">Browse homes</Link>} />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-gray-200">
          <table className="w-full min-w-[640px] table-fixed text-sm">
            <caption className="sr-only">Comparison of {homes.length} homes</caption>
            <thead>
              <tr>
                <th scope="col" className="w-40 p-4 text-left align-bottom text-xs font-semibold text-gray-500 uppercase"><span className="sr-only">Detail</span></th>
                {homes.map((home) => (
                  <th key={home.id} scope="col" className="p-4 text-left align-top font-normal">
                    <div className="relative">
                      <Link to={`/house/${home.id}`} className="block">
                        {home.media.images[0] ? <img src={cloudImage(home.media.images[0], 320)} alt="" className="aspect-video w-full rounded-xl object-cover" /> : <div className="aspect-video w-full rounded-xl bg-gray-100" />}
                        <span className="mt-3 line-clamp-2 block font-semibold text-gray-900 hover:text-brand-700">{home.title}</span>
                      </Link>
                      <button type="button" onClick={() => toggleCompare(home.id)} className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-gray-600 shadow hover:text-red-700" aria-label={`Remove ${home.title} from the comparison`}><X className="h-4 w-4" aria-hidden="true" /></button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ROWS.map((row) => {
                const best = winners(row, homes);
                return (
                  <tr key={row.label}>
                    <th scope="row" className="p-4 text-left align-top font-medium text-gray-500">{row.label}</th>
                    {homes.map((home, index) => (
                      <td key={home.id} className={`p-4 align-top text-gray-900 ${best.has(index) ? "bg-emerald-50/70 font-semibold text-emerald-900" : ""}`}>{row.value(home)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {homes.length === 1 && <p className="mt-4 text-sm text-gray-500">Add one or two more homes to compare them side by side.</p>}
      {ids.length > homes.length && homes.length > 0 && <p className="mt-4 text-sm text-gray-500">Some homes you picked are no longer listed and were left out.</p>}
    </div>
  );
};

export default Compare;
