import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import EmptyState from "../ui/EmptyState";
import FilterTabs from "../ui/FilterTabs";
import SearchInput from "../ui/SearchInput";
import WorkspaceStats from "../agent/WorkspaceStats";
import { ErrorState, TableSkeleton } from "../dashboard/States";
import ViewingCard from "./ViewingCard";
import { viewingTabs } from "./viewingGroups";
import { useTransactions } from "../../context/useTransactions";

const EMPTY = {
  action: "Nothing needs your answer right now.",
  upcoming: "No upcoming viewings.",
  past: "No past viewings yet.",
};

/**
 * Viewings booked on listings. scope "agent": the agent's (or agency's) listings, as the API allows.
 * scope "admin": every viewing on the platform (admins can act on any of them, as with offers).
 */
const ViewingsBoard = ({ scope }) => {
  const { viewings, loading, error, reload, updateTransaction } = useTransactions();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(null);
  const [query, setQuery] = useState("");
  const propertyId = params.get("property"); // set by links from a property page

  if (error) return <ErrorState title="Couldn't load viewings" message={error} onRetry={reload} />;
  if (loading) return <TableSkeleton />;

  const q = query.trim().toLowerCase();
  const scoped = viewings
    .filter((v) => !propertyId || v.property.id === propertyId)
    .filter((v) => !q || `${v.customer?.name || v.contactName} ${v.property.title} ${v.message}`.toLowerCase().includes(q));
  const tabs = viewingTabs(scoped, "owner");
  const active = tab || (tabs[0].count ? "action" : "upcoming");
  const shown = tabs.find((t) => t.id === active);
  const replace = (updated) => {
    updateTransaction("viewings", updated);
    reload(); // refresh sidebar badges
  };
  const thisWeek = viewings.filter((v) => v.statusKey === "confirmed" && new Date(v.scheduledAt) > new Date() && new Date(v.scheduledAt) - new Date() < 7 * 24 * 60 * 60 * 1000).length;

  return (
    <>
      {scope !== "admin" && <WorkspaceStats className="mb-6" items={[
        { label: "Needs your answer", value: tabs[0].count, note: "Requests and times to mark" },
        { label: "Confirmed this week", value: thisWeek, note: "In the next 7 days" },
        { label: "Upcoming", value: tabs[1].count, note: "Requested or confirmed" },
        { label: "Completed", value: viewings.filter((v) => v.statusKey === "completed").length, note: "Viewings that took place" },
      ]} />}
      {viewings.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No viewings yet" description="When customers book a time to see one of your listings, it appears here for you to confirm." />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterTabs tabs={tabs} value={active} onChange={setTab} label="Viewings" />
            <SearchInput value={query} onChange={setQuery} placeholder="Search customer or property" className="w-full sm:w-72" />
          </div>
          {shown.items.length ? (
            <ul className="mt-5 space-y-4">
              {shown.items.map((viewing) => <ViewingCard key={viewing.id} viewing={viewing} side="owner" scope={scope} onChange={replace} />)}
            </ul>
          ) : (
            <p className="mt-5 rounded-2xl bg-gray-50 p-6 text-center text-sm text-gray-500">{EMPTY[active]}</p>
          )}
        </>
      )}
    </>
  );
};

export default ViewingsBoard;
