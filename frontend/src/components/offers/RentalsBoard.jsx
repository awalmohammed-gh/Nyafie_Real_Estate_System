import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BadgeCheck, Eye, KeyRound, MessageCircle } from "lucide-react";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import FilterTabs from "../ui/FilterTabs";
import SidePanel from "../ui/SidePanel";
import WorkspaceStats from "../agent/WorkspaceStats";
import ConfirmDialog from "../ui/ConfirmDialog";
import { ErrorState, TableSkeleton } from "../dashboard/States";
import StatusSteps from "./StatusSteps";
import { useTransactions } from "../../context/useTransactions";
import SearchInput from "../ui/SearchInput";
import StatusBadge from "../ui/StatusBadge";
import WhatsAppIcon from "../ui/WhatsAppIcon";
import HistoryTimeline from "./HistoryTimeline";
import Filters from "./Filters";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { rentalApi } from "../../frontApi";
import { formatDate, isWithinDays } from "../../utils/date";
import { toWhatsAppNumber } from "../../utils/whatsapp";

const ghs = (value) => `₵${Number(value).toLocaleString()}`;
const FILTERS = [
  { id: "All", label: "All", match: () => true },
  { id: "Action", label: "Needs action", match: (r) => ["Paid", "Confirmed"].includes(r.status) },
  { id: "Payment", label: "Awaiting payment", match: (r) => ["Pending", "Payment Pending"].includes(r.status) },
  { id: "Active", label: "Active", match: (r) => r.status === "Active" },
  { id: "Closed", label: "Closed", match: (r) => ["Completed", "Cancelled"].includes(r.status) },
];

// The next steps the owner can take from each status (mirrors the server's rules)
const ACTIONS = {
  pending: [{ status: "cancelled", label: "Cancel", danger: true }],
  payment_pending: [{ status: "cancelled", label: "Cancel", danger: true }],
  paid: [
    { status: "confirmed", label: "Confirm rental" },
    { status: "cancelled", label: "Cancel", danger: true },
  ],
  confirmed: [
    { status: "active", label: "Mark moved in (active)" },
    { status: "cancelled", label: "Cancel", danger: true },
  ],
  active: [{ status: "completed", label: "Mark completed" }],
};

// Rental bookings. scope "agent": own listings only (enforced by the API); "admin": every rental.
const RentalsBoard = ({ scope }) => {
  const isAdmin = scope === "admin";
  // Records open in a side panel for admins and agents alike (stage, payment, history, next action)
  const Detail = SidePanel;
  const run = useAsyncAction();
  const { rentals, loading, error: loadError, reload, updateTransaction } = useTransactions();
  const [params] = useSearchParams();
  const [propertyId, setPropertyId] = useState(params.get("property") || "all");
  const [ownerId, setOwnerId] = useState("all");
  const [range, setRange] = useState("all");
  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { rental, action }
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const retry = reload;
  if (loadError) return <ErrorState title="Couldn't load rentals" message={loadError} onRetry={retry} />;
  if (loading) return <TableSkeleton />;

  const owners = [...new Map(rentals.map((r) => [r.owner.id, r.owner])).values()];
  const propertyOptions = [...new Map(rentals.map((r) => [r.property.id, r.property])).values()];
  const scoped = rentals
    .filter((r) => ownerId === "all" || r.owner.id === ownerId)
    .filter((r) => propertyId === "all" || r.property.id === propertyId)
    .filter((r) => range === "all" || isWithinDays(r.createdAt, Number(range)));

  const q = query.trim().toLowerCase();
  const rows = scoped
    .filter(FILTERS.find((f) => f.id === status).match)
    .filter((r) => !q || `${r.contactName} ${r.property.title} ${r.reference || ""}`.toLowerCase().includes(q));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, scoped.filter(f.match).length]));
  const open = openId && rentals.find((r) => r.id === openId);
  const chatLink = open?.conversationId && (isAdmin ? open.ownerType === "admin" && `/admin/messages?c=${open.conversationId}` : `/agent/messages?c=${open.conversationId}`);
  const whatsapp = open && toWhatsAppNumber(open.contactPhone);

  const apply = async () => {
    setBusy(true);
    const { rental, action } = confirm;
    const { ok, result } = await run(rentalApi.updateRentalStatus(rental.id, action.status, note.trim()), {
      success: `Rental ${action.status === "active" ? "marked active" : action.status}`,
      description: `${rental.contactName} has been notified.`,
    });
    if (ok) {
      updateTransaction("rentals", result);
      reload(); // refresh dashboard counts and sidebar badges
    }
    setBusy(false);
    setConfirm(null);
    setNote("");
  };

  const actionButtons = (r, size = "text-xs") =>
    (ACTIONS[r.statusKey] || []).map((action) => (
      <button
        key={action.status}
        onClick={() => setConfirm({ rental: r, action })}
        className={`btn btn-light px-3 py-1.5 ${size} ${action.danger ? "text-red-600" : "text-brand-700"}`}
      >
        {action.label}
      </button>
    ));

  const columns = [
    {
      key: "property",
      header: "Property",
      render: (r) => (
        <div className="min-w-0">
          <p className="max-w-44 truncate font-semibold text-gray-900">{r.property.title}</p>
          {isAdmin && <p className="text-xs text-gray-400">{r.ownerType === "admin" ? "Admin listing" : `Agent · ${r.owner.name}`}</p>}
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-gray-700">{r.contactName}</p>
          <p className="truncate text-xs text-gray-500">{r.contactPhone}</p>
        </div>
      ),
    },
    { key: "amount", header: "Amount", render: (r) => <span className="font-bold whitespace-nowrap text-gray-900">{ghs(r.amount)}</span> },
    { key: "payment", header: "Payment", render: (r) => <StatusBadge status={r.paymentStatus} dot={false} /> },
    { key: "status", header: "Rental", render: (r) => <StatusBadge status={r.status} /> },
    { key: "paid", header: "Date paid", render: (r) => <span className="whitespace-nowrap text-gray-600">{r.paidAt ? formatDate(r.paidAt) : "—"}</span> },
    { key: "movein", header: "Move-in", render: (r) => <span className="whitespace-nowrap text-gray-600">{formatDate(r.startDate)}</span> },
    {
      key: "view",
      header: <span className="sr-only">View</span>,
      align: "right",
      render: (r) => (
        <button onClick={() => setOpenId(r.id)} aria-label={`View rental for ${r.contactName}`} className="grid h-9 w-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900">
          <Eye className="h-4.5 w-4.5" />
        </button>
      ),
    },
  ];

  return (
    <>
      {!isAdmin && <WorkspaceStats className="mb-6" items={[
        { label: "Needs action", value: rentals.filter(FILTERS[1].match).length, note: "Confirm or prepare move-in" },
        { label: "Awaiting payment", value: rentals.filter(FILTERS[2].match).length, note: "Payment not yet completed" },
        { label: "Active rentals", value: rentals.filter(FILTERS[3].match).length, note: "Customers have moved in" },
        { label: "Completed", value: rentals.filter((r) => r.status === "Completed").length, note: "Finished rental bookings" },
      ]} />}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs label="Rental status" value={status} onChange={setStatus} tabs={FILTERS.map((f) => ({ id: f.id, label: f.label, count: counts[f.id] }))} />
        <SearchInput value={query} onChange={setQuery} placeholder="Search rentals" className="lg:w-72" />
      </div>
      <Filters isAdmin={isAdmin} owners={owners} ownerId={ownerId} setOwnerId={setOwnerId} properties={propertyOptions} propertyId={propertyId} setPropertyId={setPropertyId} range={range} setRange={setRange} />
      <DataTable
        tableFrom={isAdmin ? "md" : "xl"}
        columns={columns}
        rows={rows}
        minWidth={860}
        onRowClick={(r) => setOpenId(r.id)}
        empty={
          <EmptyState
            icon={KeyRound}
            title={rentals.length ? "No rentals match" : "No rental requests yet"}
            description={rentals.length ? "Try a different filter." : "When customers use Rent Now on your properties, their requests and payments appear here."}
          />
        }
        mobileCard={(r) => (
          <div>
            <button onClick={() => setOpenId(r.id)} className="w-full text-left">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{r.contactName}</p>
                  <p className="truncate text-sm text-gray-500">{r.property.title}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Move-in {formatDate(r.startDate)} · <span className="font-bold text-gray-900">{ghs(r.amount)}</span>
              </p>
            </button>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={r.paymentStatus} dot={false} />
              <div className="flex gap-1.5">{actionButtons(r)}</div>
            </div>
          </div>
        )}
      />

      <Detail
        open={Boolean(open)}
        onClose={() => setOpenId(null)}
        size="lg"
        title={open ? `Rental for ${open.contactName}` : ""}
        description={open && `Requested ${formatDate(open.createdAt)}`}
        footer={
          open && (
            <>
              {whatsapp && (
                <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hello ${open.contactName}, about your rental of "${open.property.title}"...`)}`} target="_blank" rel="noopener noreferrer" className="btn bg-emerald-600 text-white hover:bg-emerald-700">
                  <WhatsAppIcon />
                  WhatsApp
                </a>
              )}
              {chatLink && (
                <Link to={chatLink} className="btn btn-light">
                  <MessageCircle className="h-4 w-4" />
                  Open chat
                </Link>
              )}
            </>
          )
        }
      >
        {open && (
          <div className="space-y-5">
            <StatusSteps kind="rental" status={open.statusKey} />
            <div className="rounded-xl bg-brand-50 p-4"><p className="workspace-eyebrow">Rental summary</p><p className="mt-2 text-2xl font-semibold text-gray-900">{ghs(open.amount)}</p><p className="mt-2 text-sm text-gray-600">Move-in {formatDate(open.startDate)} · Until {formatDate(open.endDate)}</p><div className="mt-3 flex gap-2"><StatusBadge status={open.paymentStatus} /><StatusBadge status={open.status} /></div></div>
            <Link to={`/house/${open.property.id}`} className="flex items-center gap-3 rounded-lg p-2 ring-1 ring-gray-200 transition hover:ring-brand-200">
              {open.property.image && <img src={open.property.image} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" />}
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{open.property.title}</p>
                <p className="text-sm text-gray-500">{open.property.location}</p>
              </div>
            </Link>
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-4 text-sm sm:grid-cols-3">
              {[
                ["Customer", open.contactName],
                ["Phone", open.contactPhone],
                ["Email", open.contactEmail],
                ["Current address", open.currentAddress || "—"],
                ["Occupants", open.occupants],
                ["Move-in", formatDate(open.startDate)],
                ["Until", formatDate(open.endDate)],
                ["Amount", ghs(open.amount)],
                ["Reference", open.reference || "—"],
                ["Date paid", open.paidAt ? formatDate(open.paidAt) : "—"],
              ].map(([label, text]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-semibold break-words text-gray-900">{text}</dd>
                </div>
              ))}
              <div>
                <dt className="text-gray-500">Payment</dt>
                <dd className="mt-0.5"><StatusBadge status={open.paymentStatus} dot={false} /></dd>
              </div>
              <div>
                <dt className="text-gray-500">Rental</dt>
                <dd className="mt-0.5"><StatusBadge status={open.status} /></dd>
              </div>
            </dl>
            {open.notes && <p className="rounded-lg bg-brand-50/60 p-4 text-sm whitespace-pre-line text-gray-700">“{open.notes}”</p>}
            {(ACTIONS[open.statusKey] || []).length > 0 && <div className="flex flex-wrap gap-2">{actionButtons(open, "text-sm")}</div>}
            <div>
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <BadgeCheck className="h-4 w-4 text-brand-500" />
                History
              </p>
              <HistoryTimeline history={open.history} />
            </div>
          </div>
        )}
      </Detail>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={apply}
        disabled={busy}
        tone={confirm?.action.danger ? "danger" : "primary"}
        title={confirm ? `${confirm.action.label}?` : ""}
        description={
          confirm &&
          (confirm.action.status === "cancelled" && confirm.rental.paymentStatus === "Paid"
            ? `This rental is already paid. Cancelling notifies ${confirm.rental.contactName}; arrange their refund separately.`
            : `${confirm.rental.contactName}'s rental of "${confirm.rental.property.title}" will be updated and they'll be notified.`)
        }
        confirmLabel={busy ? "Saving..." : confirm?.action.label}
      >
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} placeholder="Note for the customer (optional)" className="field resize-none" />
      </ConfirmDialog>
    </>
  );
};

export default RentalsBoard;
