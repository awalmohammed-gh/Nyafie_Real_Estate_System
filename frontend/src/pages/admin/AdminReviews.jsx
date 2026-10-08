import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Star } from "lucide-react";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FilterTabs from "../../components/ui/FilterTabs";
import SearchInput from "../../components/ui/SearchInput";
import StatusBadge from "../../components/ui/StatusBadge";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { ErrorState, TableSkeleton } from "../../components/dashboard/States";
import { StarDisplay } from "../../components/reviews/Stars";
import { useApiQuery } from "../../hooks/useApiQuery";
import { REVIEWS_SEEN_EVENT } from "../../hooks/useUnseenReviews";
import { useToast } from "../../context/useToast";
import { reviewApi } from "../../frontApi";
import { formatDate, formatRelative } from "../../utils/date";

const PAGE_SIZE = 20;
const STATUS_LABEL = { published: "Published", hidden: "Hidden" };

/**
 * Customer reviews across all properties. Admins can hide inappropriate reviews and
 * restore them; review text is never edited, so what's shown is always the customer's own words.
 */
const AdminReviews = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState("all");
  const [rating, setRating] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(null); // review waiting for the hide confirmation
  const [busyId, setBusyId] = useState(null);

  // Search by property title once typing pauses
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = { status: status === "all" ? undefined : status, rating: rating || undefined, search: debounced || undefined, page, limit: PAGE_SIZE };
  const query = useApiQuery(`admin-reviews:${JSON.stringify(params)}`, () => reviewApi.getAdminReviews(params));
  const data = query.data ?? query.previous;

  // Opening this page counts as seeing every new review (clears the sidebar badge)
  useEffect(() => {
    reviewApi.markReviewsSeen().then(() => window.dispatchEvent(new Event(REVIEWS_SEEN_EVENT))).catch(() => {});
  }, []);

  const changeFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const setReviewStatus = async (review, next) => {
    setBusyId(review.id);
    try {
      const result = await reviewApi.setReviewStatus(review.id, next);
      toast({ title: result.message });
      query.reload();
    } catch (err) {
      toast({ type: "error", title: err.message });
    } finally {
      setBusyId(null);
      setPending(null);
    }
  };

  const header = <AdminPageTitle title="Reviews" description="Customer ratings and reviews. Hide anything inappropriate; hidden reviews leave the property page and its rating." />;
  if (!data && query.error) return <>{header}<ErrorState title="Couldn't load reviews" message={query.error} onRetry={query.reload} /></>;
  if (!data) return <>{header}<TableSkeleton /></>;

  const action = (r) =>
    r.status === "published" ? (
      <button type="button" onClick={() => setPending(r)} disabled={busyId === r.id} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 hover:bg-red-50 hover:text-red-700 hover:ring-red-200 disabled:opacity-50">
        <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />Hide
      </button>
    ) : (
      <button type="button" onClick={() => setReviewStatus(r, "published")} disabled={busyId === r.id} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-200 disabled:opacity-50">
        <Eye aria-hidden="true" className="h-3.5 w-3.5" />Restore
      </button>
    );

  const propertyLink = (r) =>
    r.property ? (
      <Link to={`/house/${r.property.id}#reviews`} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 hover:text-brand-700 hover:underline">{r.property.title}</Link>
    ) : (
      <span className="text-gray-400">Removed property</span>
    );

  const text = (r) => (
    <div className="min-w-0">
      {r.title && <p className="truncate font-medium text-gray-900">{r.title}</p>}
      {r.comment ? <p className="line-clamp-2 text-gray-600">{r.comment}</p> : !r.title && <p className="text-gray-400">Rating only</p>}
    </div>
  );

  const columns = [
    { key: "property", header: "Property", className: "w-[22%]", render: (r) => <div className="min-w-0">{propertyLink(r)}<p className="text-xs text-gray-500">{r.author}</p></div> },
    { key: "rating", header: "Rating", render: (r) => <StarDisplay value={r.rating} size="xs" /> },
    { key: "review", header: "Review", className: "w-[38%]", render: text },
    {
      key: "date",
      header: "Posted",
      render: (r) => (
        <span className="whitespace-nowrap text-gray-500" title={formatDate(r.createdAt)}>
          {formatRelative(r.createdAt)}
          {r.isNew && <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">New</span>}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <div>
          <StatusBadge status={STATUS_LABEL[r.status]} tone={r.status === "hidden" ? "red" : "green"} />
          {r.status === "hidden" && r.moderatedBy && <p className="mt-0.5 text-[11px] text-gray-400">by {r.moderatedBy}</p>}
        </div>
      ),
    },
    { key: "action", header: <span className="sr-only">Actions</span>, align: "right", render: action },
  ];

  return (
    <>
      {header}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          label="Review status"
          value={status}
          onChange={changeFilter(setStatus)}
          tabs={[
            { id: "all", label: "All", count: data.counts.all },
            { id: "published", label: "Published", count: data.counts.published },
            { id: "hidden", label: "Hidden", count: data.counts.hidden },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by property" className="sm:w-64" />
          <label className="sr-only" htmlFor="review-rating-filter">Rating</label>
          <select id="review-rating-filter" value={rating} onChange={(e) => changeFilter(setRating)(e.target.value)} className="field w-full rounded-full py-2 sm:w-40">
            <option value="">Any rating</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} {n === 1 ? "star" : "stars"}</option>)}
          </select>
        </div>
      </div>

      <div className={query.loading ? "opacity-60 transition-opacity" : ""}>
        <DataTable
          columns={columns}
          rows={data.items}
          pageSize={PAGE_SIZE}
          minWidth={900}
          empty={
            <EmptyState
              icon={Star}
              title={debounced || rating || status !== "all" ? "No reviews match these filters" : "No reviews yet"}
              description={debounced || rating || status !== "all" ? "Try another property name or rating." : "Customer ratings and reviews appear here as soon as they're posted."}
            />
          }
          mobileCard={(r) => (
            <div className="space-y-1.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">{propertyLink(r)}<p className="text-xs text-gray-500">{r.author} · {formatRelative(r.createdAt)}</p></div>
                <StatusBadge status={STATUS_LABEL[r.status]} tone={r.status === "hidden" ? "red" : "green"} />
              </div>
              <StarDisplay value={r.rating} size="xs" />
              {text(r)}
              <div className="pt-1">{action(r)}</div>
            </div>
          )}
        />
      </div>

      {data.pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span className="tabular-nums">Page {data.page} of {data.pages} · {data.total} reviews</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page" className="grid h-8 w-8 place-items-center rounded-md text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= data.pages} aria-label="Next page" className="grid h-8 w-8 place-items-center rounded-md text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={() => setReviewStatus(pending, "hidden")}
        disabled={busyId === pending?.id}
        title="Hide this review?"
        description="It will disappear from the property page and stop counting toward the property's rating. The customer still sees it, marked as hidden. You can restore it at any time."
        confirmLabel="Hide review"
      />
    </>
  );
};

export default AdminReviews;
