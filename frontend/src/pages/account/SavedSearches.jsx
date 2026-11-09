import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BellRing, Check, Mail, Pencil, Search, Trash2, X } from "lucide-react";
import AccountShell from "../../components/account/AccountShell";
import EmptyState from "../../components/ui/EmptyState";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { savedSearchApi } from "../../frontApi";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useToast } from "../../context/useToast";
import { usePlatform } from "../../context/usePlatform";
import { useAuth } from "../../context/useAuth";
import { describeFilters, savedSearchPath } from "../../utils/savedSearch";
import { formatDate, formatRelative } from "../../utils/date";

// One saved search: what it looks for, a link to its results, its email alerts, rename and delete
const SavedSearchCard = ({ search, listingsPath, onChange, onDelete }) => {
  const { toast } = useToast();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(search.name);
  const [busy, setBusy] = useState(false);

  const update = async (changes, success) => {
    setBusy(true);
    try {
      onChange(await savedSearchApi.updateSavedSearch(search.id, changes));
      if (success) toast({ title: success });
      return true;
    } catch (err) {
      toast({ type: "error", title: err.message });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const rename = async (event) => {
    event.preventDefault();
    if (await update({ name: name.trim() }, "Search renamed")) setRenaming(false);
  };

  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm shadow-gray-900/3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {renaming ? (
          <form onSubmit={rename} className="flex min-w-0 flex-1 items-center gap-2">
            <label htmlFor={`search-name-${search.id}`} className="sr-only">Search name</label>
            <input id={`search-name-${search.id}`} value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} required autoFocus className="field min-w-0 flex-1 py-2" />
            <button type="submit" disabled={busy || !name.trim()} aria-label="Save name" className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-white disabled:opacity-50"><Check aria-hidden="true" className="h-4 w-4" /></button>
            <button type="button" onClick={() => { setName(search.name); setRenaming(false); }} aria-label="Cancel renaming" className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 text-gray-600"><X aria-hidden="true" className="h-4 w-4" /></button>
          </form>
        ) : (
          <div className="min-w-0">
            <h2 className="text-base font-bold break-words text-gray-900">{search.name}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Saved {formatDate(search.createdAt)}
              {search.lastAlertAt && ` · last new match ${formatRelative(search.lastAlertAt)}`}
            </p>
          </div>
        )}
        {!renaming && (
          <div className="flex gap-1">
            <button type="button" onClick={() => setRenaming(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"><Pencil aria-hidden="true" className="h-3.5 w-3.5" />Rename</button>
            <button type="button" onClick={() => onDelete(search)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-700"><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />Delete</button>
          </div>
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Filters">
        {describeFilters(search.filters).map((label) => <li key={label} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">{label}</li>)}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-gray-700">
          <input type="checkbox" checked={search.emailAlerts} disabled={busy} onChange={(e) => update({ emailAlerts: e.target.checked }, e.target.checked ? "Email alerts on" : "Email alerts off")} className="h-4 w-4 accent-brand-600" />
          <Mail aria-hidden="true" className="h-4 w-4 text-gray-400" />
          Also email me new matches
        </label>
        <Link to={savedSearchPath(search.filters, listingsPath)} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
          View results
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    </li>
  );
};

const SavedSearches = () => {
  const { paths } = usePlatform();
  const { user } = useAuth();
  const { toast } = useToast();
  const searches = useApiQuery(`saved-searches:${user?.id}`, () => savedSearchApi.getSavedSearches());
  const [items, setItems] = useState(null); // local edits on top of the loaded list
  const [deleting, setDeleting] = useState(null);
  const list = items || searches.data || [];
  const alertsOff = user?.preferences?.searchAlerts === false;

  const replace = (updated) => setItems(list.map((search) => (search.id === updated.id ? updated : search)));
  const remove = async () => {
    const target = deleting;
    setDeleting(null);
    try {
      await savedSearchApi.deleteSavedSearch(target.id);
      setItems(list.filter((search) => search.id !== target.id));
      toast({ title: "Saved search deleted" });
    } catch (err) {
      toast({ type: "error", title: err.message });
    }
  };

  return (
    <AccountShell title="Saved Searches" description="We'll tell you when new homes match these searches.">
      {alertsOff && (
        <p className="mb-5 flex items-start gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <BellRing aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Saved search alerts are switched off in your <Link to="/account/settings" className="font-semibold underline">notification settings</Link>, so you won't be told about new matches.</span>
        </p>
      )}
      {searches.loading && !items ? (
        <div className="space-y-4" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-gray-100" />)}</div>
      ) : searches.error && !items ? (
        <div role="alert" className="rounded-3xl bg-red-50 px-6 py-12 text-center">
          <p className="font-semibold text-gray-900">Unable to load your saved searches</p>
          <p className="mt-1 text-sm text-gray-600">{searches.error}</p>
          <button onClick={searches.reload} className="btn btn-primary mt-5">Retry</button>
        </div>
      ) : list.length ? (
        <ul className="space-y-4">
          {list.map((search) => <SavedSearchCard key={search.id} search={search} listingsPath={paths.listings} onChange={replace} onDelete={setDeleting} />)}
        </ul>
      ) : (
        <EmptyState
          icon={Search}
          title="No saved searches yet"
          description="Search for homes, then tap “Save search”. We'll let you know when new homes match."
          action={<Link to={paths.listings} className="btn btn-primary">Search homes</Link>}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete this saved search?"
        description={deleting ? `“${deleting.name}” and its alerts will be removed.` : ""}
        confirmLabel="Delete search"
      />
    </AccountShell>
  );
};

export default SavedSearches;
