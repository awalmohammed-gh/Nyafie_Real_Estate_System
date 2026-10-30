import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Inbox, Mail, Phone, RefreshCw } from "lucide-react";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import DataTable from "../../components/ui/DataTable";
import FilterTabs from "../../components/ui/FilterTabs";
import SearchInput from "../../components/ui/SearchInput";
import StatusBadge from "../../components/ui/StatusBadge";
import AdminRecordModal from "../../components/admin/AdminRecordModal";
import EmptyState from "../../components/ui/EmptyState";
import { ErrorState, TableSkeleton } from "../../components/dashboard/States";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useToast } from "../../context/useToast";
import { contactApi } from "../../frontApi";
import { formatDate, formatRelative } from "../../utils/date";

const STATUSES = { new: "New", contacted: "Contacted", inProgress: "In Progress", closed: "Closed" };

const AdminContactMessages = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const params = { status, search: debounced, page };
  const query = useApiQuery(`contact-messages:${JSON.stringify(params)}`, () => contactApi.getMessages(params));
  const data = query.data ?? query.previous;

  const changeStatus = async (next) => {
    if (busy || open.status === next) return;
    setBusy(true);
    try {
      setOpen(await contactApi.setMessageStatus(open.id, next));
      query.reload();
      toast({ title: `Marked as ${STATUSES[next].toLowerCase()}` });
    } catch (error) { toast({ type: "error", title: error.message }); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: "sender", header: "From", render: (message) => <div><p className="font-semibold text-gray-900">{message.name}</p><p className="text-xs text-gray-500">{message.email}</p></div> },
    { key: "subject", header: "Subject", render: (message) => <div className="max-w-80"><p className="truncate font-medium text-gray-900">{message.subject}</p><p className="line-clamp-1 text-gray-500">{message.message}</p></div> },
    { key: "date", header: "Received", render: (message) => <span className="whitespace-nowrap text-gray-500">{formatRelative(message.createdAt)}</span> },
    { key: "status", header: "Status", render: (message) => <StatusBadge status={STATUSES[message.status]} /> },
    { key: "action", header: <span className="sr-only">View message</span>, align: "right", render: (message) => <button type="button" onClick={() => setOpen(message)} aria-label={`Read message from ${message.name}`} className="grid h-10 w-10 place-items-center rounded-lg text-gray-500 hover:bg-brand-50 hover:text-brand-700"><Eye size={18} /></button> },
  ];

  return (
    <>
      <AdminPageTitle title="Contact messages" description="General messages sent through the website contact form. Reply by email or phone and track their status here." action={<button type="button" onClick={query.reload} disabled={query.loading} className="btn btn-light"><RefreshCw size={16} aria-hidden="true" />Refresh</button>} />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs label="Message status" value={status} onChange={(next) => { setStatus(next); setPage(1); }} tabs={[{ id: "all", label: "All", count: data?.counts.all }, ...Object.entries(STATUSES).map(([id, label]) => ({ id, label, count: data?.counts[id] }))]} />
        <SearchInput value={search} onChange={(next) => { setSearch(next); setPage(1); }} placeholder="Search sender, subject or message" className="lg:w-80" />
      </div>
      {query.error ? <ErrorState title="Couldn't load messages" message={query.error} onRetry={query.reload} /> : !data ? <TableSkeleton /> : (
        <div className={query.loading ? "pointer-events-none opacity-60" : ""} aria-busy={query.loading}>
          <DataTable columns={columns} rows={data.items} minWidth={850} onRowClick={setOpen} empty={<EmptyState icon={Inbox} title="No contact messages" description="Messages from the contact page will appear here. Try another search or status if you have filters selected." />} mobileCard={(message) => <button type="button" onClick={() => setOpen(message)} className="w-full space-y-2 text-left"><div className="flex items-start justify-between gap-3"><p className="font-semibold text-gray-900">{message.name}</p><StatusBadge status={STATUSES[message.status]} /></div><p className="font-medium text-gray-700">{message.subject}</p><p className="line-clamp-2 text-sm text-gray-500">{message.message}</p><p className="text-xs text-gray-500">{formatRelative(message.createdAt)}</p></button>} />
          {data.pages > 1 && <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-500"><span>Page {data.page} of {data.pages} · {data.total} messages</span><div className="flex gap-2"><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 disabled:opacity-40"><ChevronLeft size={18} /></button><button type="button" aria-label="Next page" disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 disabled:opacity-40"><ChevronRight size={18} /></button></div></div>}
        </div>
      )}
      <AdminRecordModal open={Boolean(open)} onClose={() => !busy && setOpen(null)} title={open?.subject || "Contact message"} description={open ? `Received ${formatDate(open.createdAt)}` : ""} footer={open && <>{open.phone && <a href={`tel:${open.phone.replace(/[^\d+]/g, "")}`} className="btn btn-light"><Phone size={16} />Call sender</a>}<a href={`mailto:${encodeURIComponent(open.email)}?subject=${encodeURIComponent(`Re: ${open.subject}`)}`} className="btn btn-primary"><Mail size={16} />Reply by email</a></>}>
        {open && <div className="space-y-6"><dl className="grid gap-4 rounded-xl bg-gray-50 p-4 text-sm">{[["From", open.name], ["Email", open.email], ["Phone", open.phone || "Not provided"]].map(([label, value]) => <div key={label}><dt className="text-gray-500">{label}</dt><dd className="font-medium break-words text-gray-900">{value}</dd></div>)}</dl><p className="text-sm leading-7 whitespace-pre-wrap break-words text-gray-700">{open.message}</p><div><h2 className="mb-3 text-sm font-semibold">Message status</h2><div role="group" aria-label="Message status" className="grid grid-cols-2 gap-2">{Object.entries(STATUSES).map(([key, label]) => <button key={key} type="button" disabled={busy} aria-pressed={open.status === key} onClick={() => changeStatus(key)} className={`rounded-lg border px-3 py-2.5 text-sm font-medium disabled:opacity-50 ${open.status === key ? "border-brand-200 bg-brand-50 text-brand-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{label}</button>)}</div></div></div>}
      </AdminRecordModal>
    </>
  );
};

export default AdminContactMessages;
