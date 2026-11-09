import { useState } from "react";
import { CheckCircle2, Clock, EyeOff, Loader2 } from "lucide-react";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import StatusBadge from "../ui/StatusBadge";

// The badge shown on a listing that needs (or missed) its availability check
export const FreshnessBadge = ({ property }) => {
  if (property.listing.freshness === "hidden") return <span title="Hidden from search until you confirm it is still available"><StatusBadge status="Hidden: confirm availability" tone="red" dot={false} /></span>;
  if (property.listing.freshness === "confirm") return <span title="Confirm it is still available, or it will be hidden from search"><StatusBadge status="Confirm availability" tone="amber" dot={false} /></span>;
  return null;
};

/**
 * Listing freshness for owners: listings to confirm (asked after 30 days) or hidden (unconfirmed
 * for 14 more days), each with "Still available". `onConfirm(id)` confirms one listing.
 * Listings that were rented or sold should be marked so in the editor instead.
 */
const FreshnessNotice = ({ listings, onConfirm, className = "" }) => {
  const run = useAsyncAction();
  const [busy, setBusy] = useState(null);
  const due = listings.filter((property) => property.listing.freshness !== "fresh");
  if (!due.length) return null;
  const hiddenCount = due.filter((property) => property.listing.freshness === "hidden").length;

  const confirm = async (property) => {
    setBusy(property.id);
    await run(onConfirm(property.id), { success: property.listing.freshness === "hidden" ? "Listing confirmed and shown again" : "Listing confirmed as still available", description: property.title });
    setBusy(null);
  };

  return (
    <section aria-labelledby="freshness-heading" className={`rounded-2xl border p-5 ${hiddenCount ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/70"} ${className}`}>
      <h2 id="freshness-heading" className="flex items-center gap-2 text-sm font-bold text-gray-900">
        {hiddenCount ? <EyeOff aria-hidden="true" className="h-4 w-4 text-red-600" /> : <Clock aria-hidden="true" className="h-4 w-4 text-amber-600" />}
        {due.length === 1 ? "1 listing needs" : `${due.length} listings need`} your confirmation
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Are these homes still available? Confirm them so customers only see homes they can get. If one was rented or sold, edit it and change its availability instead.
        {hiddenCount > 0 && " Hidden listings don't appear in search until you confirm them."}
      </p>
      <ul className="mt-4 divide-y divide-black/5 rounded-xl bg-white ring-1 ring-black/5">
        {due.slice(0, 8).map((property) => (
          <li key={property.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-gray-900">{property.title}</span>
              <FreshnessBadge property={property} />
            </div>
            <button type="button" onClick={() => confirm(property)} disabled={Boolean(busy)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {busy === property.id ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />}
              Still available
            </button>
          </li>
        ))}
      </ul>
      {due.length > 8 && <p className="mt-2 text-xs text-gray-500">And {due.length - 8} more: use “Still available” in each listing’s actions.</p>}
    </section>
  );
};

export default FreshnessNotice;
