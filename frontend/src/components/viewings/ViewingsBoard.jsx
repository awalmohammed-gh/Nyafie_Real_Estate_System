import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import EmptyState from "../ui/EmptyState";
import FilterTabs from "../ui/FilterTabs";
import SearchInput from "../ui/SearchInput";
import WorkspaceStats from "../agent/WorkspaceStats";
import { ErrorState, TableSkeleton } from "../dashboard/States";
import ViewingCard from "./ViewingCard";
import { Pager } from "../ui/DataTable";
import { viewingApi } from "../../frontApi";
import { useDebounced, usePagedList } from "../../hooks/usePagedList";
import { useTransactions } from "../../context/useTransactions";

const TABS = [
  { id: "action", label: "Needs your answer" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past & closed" },
];
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
  const { reloadCounts } = useTransactions();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(null); // null: the server picks (what needs an answer first)
  const [query, setQuery] = useState("");
  const propertyId = params.get("property"); // set by links from a property page

  const search = useDebounced(query.trim());
  const list = usePagedList(`${scope}-viewings`, { tab: tab || undefined, property: propertyId || undefined, search: search || undefined }, (filters) => viewingApi.getViewingsPage(scope, filters));
  if (!list.data) return list.error ? <ErrorState title="Couldn't load viewings" message={list.error} onRetry={list.reload} /> : <TableSkeleton />;

  const { items, counts, stats, empty, tab: active } = list.data;
  const tabs = TABS.map((entry) => ({ ...entry, count: counts[entry.id] }));
  const replace = () => {
    list.reload();
    reloadCounts(); // sidebar badges
  };

  return (
    <>
      {scope !== "admin" && <WorkspaceStats className="mb-6" items={[
        { label: "Needs your answer", value: stats.action, note: "Requests and times to mark" },
        { label: "Confirmed this week", value: stats.week, note: "In the next 7 days" },
        { label: "Upcoming", value: stats.upcoming, note: "Requested or confirmed" },
        { label: "Completed", value: stats.completed, note: "Viewings that took place" },
      ]} />}
      {empty ? (
        <EmptyState icon={CalendarClock} title="No viewings yet" description="When customers book a time to see one of your listings, it appears here for you to confirm." />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterTabs tabs={tabs} value={active} onChange={setTab} label="Viewings" />
            <SearchInput value={query} onChange={setQuery} placeholder="Search customer or property" className="w-full sm:w-72" />
          </div>
          {items.length ? (
            <ul className="mt-5 space-y-4">
              {items.map((viewing) => <ViewingCard key={viewing.id} viewing={viewing} side="owner" scope={scope} onChange={replace} />)}
              {list.paging.pages > 1 && <li><Pager {...list.paging} /></li>}
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
