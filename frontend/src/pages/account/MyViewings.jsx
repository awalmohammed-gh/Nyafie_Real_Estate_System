import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Info } from "lucide-react";
import AccountShell from "../../components/account/AccountShell";
import EmptyState from "../../components/ui/EmptyState";
import FilterTabs from "../../components/ui/FilterTabs";
import PageLoader from "../../components/ui/PageLoader";
import ViewingCard from "../../components/viewings/ViewingCard";
import { viewingTabs } from "../../components/viewings/viewingGroups";
import { viewingApi } from "../../frontApi";

const EMPTY = {
  action: "Nothing is waiting for your answer.",
  upcoming: "No upcoming viewings.",
  past: "No past viewings yet.",
};

const MyViewings = () => {
  const [viewings, setViewings] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(null);

  useEffect(() => {
    viewingApi.getMyViewings().then(setViewings).catch((err) => setError(err.message));
  }, []);

  const replace = (updated) => setViewings((list) => list.map((v) => (v.id === updated.id ? updated : v)));
  const tabs = viewings ? viewingTabs(viewings, "customer") : [];
  // Open where something is happening: an answer needed, else what's coming up
  const active = tab || tabs.find((t) => t.id !== "past" && t.count)?.id || "upcoming";
  const shown = tabs.find((t) => t.id === active);

  return (
    <AccountShell title="My Viewings" description="Times you've booked to see properties, and what the owners said.">
      <p className="mb-6 flex items-start gap-3 rounded-2xl bg-sky-50 p-4 text-sm text-sky-800">
        <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        Viewings are free. Meet the owner or agent shown on the listing, and never pay anyone just to see a property.
      </p>
      {error ? (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : !viewings ? (
        <PageLoader label="Loading your viewings..." />
      ) : viewings.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="You haven't booked any viewings"
          description="Open a home for sale or rent and choose “Book a viewing” to pick a time with the owner."
          action={<Link to="/listings" className="btn btn-primary">Browse homes</Link>}
        />
      ) : (
        <>
          <FilterTabs tabs={tabs} value={active} onChange={setTab} label="Viewings" />
          {shown.items.length ? (
            <ul className="mt-5 space-y-4">{shown.items.map((viewing) => <ViewingCard key={viewing.id} viewing={viewing} side="customer" onChange={replace} />)}</ul>
          ) : (
            <p className="mt-5 rounded-2xl bg-gray-50 p-6 text-center text-sm text-gray-500">{EMPTY[active]}</p>
          )}
        </>
      )}
    </AccountShell>
  );
};

export default MyViewings;
