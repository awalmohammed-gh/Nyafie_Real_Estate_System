import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, Inbox, Mail, Phone } from "lucide-react";
import { useAdminData } from "../../hooks/useAdminData";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import DataTable from "../../components/ui/DataTable";
import FilterTabs from "../../components/ui/FilterTabs";
import SearchInput from "../../components/ui/SearchInput";
import StatusBadge from "../../components/ui/StatusBadge";
import AdminRecordModal from "../../components/admin/AdminRecordModal";
import EmptyState from "../../components/ui/EmptyState";
import { formatDate, formatRelative, isWithinDays } from "../../utils/date";
import { formatPrice } from "../../utils/property";
import { usePlatform } from "../../context/usePlatform";

const STATUSES = ["New", "Contacted", "In Progress", "Closed"];
const RANGES = [
  { id: "all", label: "Any time" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "90", label: "Last 90 days" },
];

const AdminInquiries = () => {
  const { siteName } = usePlatform();
  const { inquiries, agents, allAgents, findProperty, updateInquiryStatus } = useAdminData();
  const run = useAsyncAction();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(params.get("status") || "All");
  const [agentId, setAgentId] = useState(params.get("agent") || "all");
  const [propertyId, setPropertyId] = useState("all");
  const [range, setRange] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);

  const ownerName = (inq) => (inq.ownerType === "admin" ? siteName : allAgents.find((a) => a.id === inq.ownerId)?.name || "Deleted agent");

  const scoped = inquiries
    .filter((i) => agentId === "all" || (agentId === "admin" ? i.ownerType === "admin" : i.ownerId === agentId))
    .filter((i) => propertyId === "all" || i.propertyId === propertyId)
    .filter((i) => range === "all" || isWithinDays(i.createdAt, Number(range)));
  const q = query.trim().toLowerCase();
  const rows = scoped
    .filter((i) => status === "All" || i.status === status)
    .filter((i) => !q || `${i.name} ${i.email} ${i.message} ${findProperty(i.propertyId)?.title || ""}`.toLowerCase().includes(q))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Properties that have inquiries, limited to the selected agent
  const propertyOptions = [...new Set(inquiries.filter((i) => agentId === "all" || (agentId === "admin" ? i.ownerType === "admin" : i.ownerId === agentId)).map((i) => i.propertyId))]
    .map((id) => findProperty(id))
    .filter(Boolean);

  const open = openId && inquiries.find((i) => i.id === openId);
  const openProperty = open && findProperty(open.propertyId);

  const columns = [
    {
      key: "customer",
      header: "Customer",
      render: (i) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{i.name}</p>
          <p className="truncate text-xs text-gray-500">{i.email}</p>
        </div>
      ),
    },
    { key: "property", header: "Property", render: (i) => <span className="block max-w-48 truncate text-gray-700">{findProperty(i.propertyId)?.title || "Removed property"}</span> },
    { key: "agent", header: "Agent", render: (i) => <span className="whitespace-nowrap text-gray-700">{ownerName(i)}</span> },
    { key: "message", header: "Message", render: (i) => <span className="line-clamp-1 max-w-64 text-gray-500">{i.message}</span> },
    { key: "date", header: "Date", render: (i) => <span className="whitespace-nowrap text-gray-600">{formatRelative(i.createdAt)}</span> },
    { key: "status", header: "Status", render: (i) => <StatusBadge status={i.status} /> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      render: (i) => (
        <button onClick={() => setOpenId(i.id)} aria-label={`View inquiry from ${i.name}`} className="grid h-9 w-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900">
          <Eye className="h-4.5 w-4.5" />
        </button>
      ),
    },
  ];

  const changeStatus = (inq, next) => {
    if (inq.status === next) return;
    run(updateInquiryStatus(inq.id, next), { success: `Marked as ${next.toLowerCase()}`, description: `Inquiry from ${inq.name}` });
  };

  return (
    <>
      <AdminPageTitle title="Inquiries" description={`All customer inquiries across ${siteName} and agent listings.`} />

      <div className="mb-5 flex flex-col gap-3">
        <FilterTabs
          value={status}
          onChange={setStatus}
          tabs={["All", ...STATUSES].map((s) => ({ id: s, label: s, count: scoped.filter((i) => s === "All" || i.status === s).length }))}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SearchInput value={query} onChange={setQuery} placeholder="Search customer or message" />
          <select
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
              setPropertyId("all");
              const next = new URLSearchParams(params);
              next.delete("agent");
              setParams(next, { replace: true });
            }}
            aria-label="Filter by agent"
            className="field py-2"
          >
            <option value="all">All agents</option>
            <option value="admin">{siteName} (admin listings)</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label="Filter by property" className="field py-2">
            <option value="all">All properties</option>
            {propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Filter by date" className="field py-2">
            {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        minWidth={1000}
        empty={<EmptyState icon={Inbox} title="No inquiries match" description="Try widening the filters." />}
        mobileCard={(i) => (
          <button onClick={() => setOpenId(i.id)} className="w-full text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{i.name}</p>
                <p className="truncate text-sm text-gray-500">{findProperty(i.propertyId)?.title || "Removed property"} · {ownerName(i)}</p>
              </div>
              <StatusBadge status={i.status} />
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-gray-600">{i.message}</p>
            <p className="mt-2 text-xs text-gray-400">{formatRelative(i.createdAt)}</p>
          </button>
        )}
      />

      <AdminRecordModal
        open={Boolean(open)}
        onClose={() => setOpenId(null)}
        title={open ? `Inquiry from ${open.name}` : ""}
        description={open && `Received ${formatDate(open.createdAt)} · handled by ${ownerName(open)}`}
        footer={open && (
          <>
            <a href={`tel:${open.phone.replace(/\s+/g, "")}`} className="btn btn-light"><Phone className="h-4 w-4" />Call</a>
            <a href={`mailto:${open.email}`} className="btn btn-primary"><Mail className="h-4 w-4" />Email customer</a>
          </>
        )}
      >
        {open && (
          <div className="space-y-5">
            <dl className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
              {[["Customer", open.name], ["Email", open.email], ["Phone", open.phone], ["Agent", ownerName(open)]].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-semibold break-all text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
            {openProperty && (
              <div className="flex items-center gap-3 rounded-lg p-2 ring-1 ring-slate-200">
                <img src={openProperty.media.images[0]} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{openProperty.title}</p>
                  <p className="text-sm text-gray-500">{formatPrice(openProperty)} · {openProperty.location.name}</p>
                </div>
              </div>
            )}
            <p className="rounded-lg bg-brand-50/60 p-4 text-sm leading-relaxed whitespace-pre-line text-gray-700">{open.message}</p>
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-900">Status</p>
              <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-4">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    role="radio"
                    aria-checked={open.status === s}
                    onClick={() => changeStatus(open, s)}
                    className={`rounded-lg py-2 text-sm font-semibold transition ${open.status === s ? "bg-white text-brand-700 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </AdminRecordModal>
    </>
  );
};

export default AdminInquiries;
