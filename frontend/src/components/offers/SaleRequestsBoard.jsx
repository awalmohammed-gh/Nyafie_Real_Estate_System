import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BadgeCheck, Building, CheckCircle2, Eye, Loader2, MessageCircle, Wallet } from "lucide-react";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import FilterTabs from "../ui/FilterTabs";
import SidePanel from "../ui/SidePanel";
import AdminRecordModal from "../admin/AdminRecordModal";
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
import { saleRequestApi } from "../../frontApi";
import { SALE_STATUS } from "../../frontApi/mappers";
import { formatDate, formatRelative, isWithinDays } from "../../utils/date";
import { toWhatsAppNumber } from "../../utils/whatsapp";
import { usePlatform } from "../../context/usePlatform";

const ghs = (value) => `₵${Number(value).toLocaleString()}`;
const CLOSED = ["completed", "cancelled", "rejected"];
// Statuses the owner picks directly; payment confirmation and completion have their own buttons
const SETTABLE = ["contacted", "offer_received", "negotiating", "approved", "payment_pending", "cancelled", "rejected"];
// These need a confirmation step
const NEEDS_CONFIRM = { approved: "Approve", payment_pending: "Request payment", cancelled: "Cancel request", rejected: "Reject request" };
const TABS = [
  { id: "open", label: "Open", match: (r) => !CLOSED.includes(r.statusKey) },
  { id: "payment", label: "Awaiting payment", match: (r) => r.statusKey === "payment_pending" },
  { id: "completed", label: "Completed", match: (r) => r.statusKey === "completed" },
  { id: "closed", label: "Cancelled/Rejected", match: (r) => ["cancelled", "rejected"].includes(r.statusKey) },
  { id: "all", label: "All", match: () => true },
];

/**
 * Buy Now requests on listings. scope "agent": the agent's own listings only
 * (enforced by the API); scope "admin": every request, with an owner filter.
 */
const SaleRequestsBoard = ({ scope }) => {
  const { siteName } = usePlatform();
  const isAdmin = scope === "admin";
  const Detail = isAdmin ? AdminRecordModal : SidePanel;
  const run = useAsyncAction();
  const { sales: requests, loading, error: loadError, reload, updateTransaction } = useTransactions();
  const [params] = useSearchParams();
  const [propertyId, setPropertyId] = useState(params.get("property") || "all");
  const [range, setRange] = useState("all");
  const [tab, setTab] = useState("open");
  const [query, setQuery] = useState("");
  const [ownerId, setOwnerId] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [nextStatus, setNextStatus] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(null); // { kind: "status" | "payment" | "complete", status? }
  const [paidAmount, setPaidAmount] = useState("");
  const [busy, setBusy] = useState("");

  const retry = reload;
  if (loadError) return <ErrorState title="Couldn't load sale requests" message={loadError} onRetry={retry} />;
  if (loading) return <TableSkeleton />;

  const owners = [...new Map(requests.map((r) => [r.owner.id, r.owner])).values()];
  const propertyOptions = [...new Map(requests.map((r) => [r.property.id, r.property])).values()];
  const scoped = requests
    .filter((r) => ownerId === "all" || r.owner.id === ownerId)
    .filter((r) => propertyId === "all" || r.property.id === propertyId)
    .filter((r) => range === "all" || isWithinDays(r.createdAt, Number(range)));
  const q = query.trim().toLowerCase();
  const rows = scoped
    .filter(TABS.find((t) => t.id === tab).match)
    .filter((r) => !q || `${r.contactName} ${r.contactEmail} ${r.contactPhone} ${r.property.title}`.toLowerCase().includes(q));

  const open = openId && requests.find((r) => r.id === openId);
  const closed = open && CLOSED.includes(open.statusKey);
  const paymentConfirmed = open?.paymentStatusKey === "confirmed";
  const chatLink = open?.conversationId && (isAdmin ? open.ownerType === "admin" && `/admin/messages?c=${open.conversationId}` : `/agent/messages?c=${open.conversationId}`);
  const whatsapp = open && toWhatsAppNumber(open.contactPhone);

  const replace = (updated) => {
    updateTransaction("sales", updated);
    reload(); // refresh dashboard counts and sidebar badges
  };
  const openRequest = (id) => {
    setOpenId(id);
    setNextStatus("");
    setNote("");
  };

  const perform = async (kind, status) => {
    setBusy(kind);
    const requestsByKind = {
      status: () => saleRequestApi.updateSaleStatus(open.id, status, note.trim()),
      payment: () => saleRequestApi.confirmOfficePayment(open.id, paidAmount === "" ? undefined : Number(paidAmount), note.trim()),
      complete: () => saleRequestApi.completeSale(open.id),
    };
    const messages = {
      status: `Marked as ${SALE_STATUS[status]?.toLowerCase()}`,
      payment: "Office payment confirmed",
      complete: "Sale completed and property marked as sold",
    };
    const { ok, result } = await run(requestsByKind[kind](), { success: messages[kind], description: `${open.contactName} has been notified.` });
    if (ok) {
      replace(result);
      setNextStatus("");
      setNote("");
    }
    setBusy("");
    setConfirm(null);
  };

  const applyStatus = () => {
    if (NEEDS_CONFIRM[nextStatus]) setConfirm({ kind: "status", status: nextStatus });
    else perform("status", nextStatus);
  };

  const columns = [
    {
      key: "customer",
      header: "Customer",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{r.contactName}</p>
          <p className="truncate text-xs text-gray-500">{r.contactPhone}</p>
        </div>
      ),
    },
    {
      key: "property",
      header: "Property",
      render: (r) => (
        <div className="min-w-0">
          <p className="max-w-48 truncate text-gray-700">{r.property.title}</p>
          {isAdmin && <p className="text-xs text-gray-400">{r.ownerType === "admin" ? "Admin listing" : `Agent · ${r.owner.name}`}</p>}
        </div>
      ),
    },
    { key: "price", header: "Price", render: (r) => <span className="whitespace-nowrap text-gray-700">{ghs(r.askingPrice)}</span> },
    { key: "offer", header: "Offer", render: (r) => (r.offer ? <span className="font-bold whitespace-nowrap text-brand-600">{ghs(r.offer.amount)}</span> : <span className="text-gray-400">—</span>) },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "payment", header: "Payment", render: (r) => <StatusBadge status={r.paymentStatus} dot={false} /> },
    { key: "date", header: "Requested", render: (r) => <span className="whitespace-nowrap text-gray-600">{formatRelative(r.createdAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      render: (r) => (
        <button onClick={() => openRequest(r.id)} aria-label={`View request from ${r.contactName}`} className="grid h-9 w-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900">
          <Eye className="h-4.5 w-4.5" />
        </button>
      ),
    },
  ];

  const confirmCopy = confirm && {
    status: {
      title: `${NEEDS_CONFIRM[confirm.status]}?`,
      description:
        confirm.status === "payment_pending"
          ? `${open?.contactName} will be asked to pay ${ghs(open?.askingPrice)} at the office.`
          : `The request from ${open?.contactName} will be marked as ${SALE_STATUS[confirm.status]?.toLowerCase()} and they'll be notified.`,
      label: NEEDS_CONFIRM[confirm.status],
      tone: ["cancelled", "rejected"].includes(confirm.status) ? "danger" : "primary",
    },
    payment: { title: "Confirm office payment?", description: `Only confirm once you've received ${open?.contactName}'s payment at the office. This is recorded with your name and the time.`, label: "Confirm payment", tone: "primary" },
    complete: { title: "Complete sale and mark as sold?", description: `"${open?.property.title}" will be marked as sold. Other open requests and offers on it will be closed.`, label: "Mark as sold", tone: "primary" },
  }[confirm.kind];

  return (
    <>
      {!isAdmin && <WorkspaceStats className="mb-6" items={[
        { label: "Open requests", value: requests.filter(TABS[0].match).length, note: "Your current buyer pipeline" },
        { label: "Awaiting payment", value: requests.filter(TABS[1].match).length, note: "Office payment outstanding" },
        { label: "Payment received", value: requests.filter((r) => r.paymentStatusKey === "confirmed" && !CLOSED.includes(r.statusKey)).length, note: "Ready to complete the sale" },
        { label: "Completed sales", value: requests.filter(TABS[2].match).length, note: "Successfully closed requests" },
      ]} />}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs label="Request status" value={tab} onChange={setTab} tabs={TABS.map((t) => ({ id: t.id, label: t.label, count: scoped.filter(t.match).length }))} />
        <SearchInput value={query} onChange={setQuery} placeholder="Search requests" className="lg:w-72" />
      </div>
      <Filters isAdmin={isAdmin} owners={owners} ownerId={ownerId} setOwnerId={setOwnerId} properties={propertyOptions} propertyId={propertyId} setPropertyId={setPropertyId} range={range} setRange={setRange} />

      <DataTable
        tableFrom={isAdmin ? "md" : "xl"}
        columns={columns}
        rows={rows}
        onRowClick={(r) => openRequest(r.id)}
        minWidth={isAdmin ? 980 : 900}
        empty={
          <EmptyState
            icon={Building}
            title={requests.length ? "No requests here" : "No sale requests yet"}
            description={requests.length ? "Try a different filter." : "Customers' purchase inquiries about your sale listings appear here. Discuss the price and next steps with them."}
          />
        }
        mobileCard={(r) => (
          <button onClick={() => openRequest(r.id)} className="w-full text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{r.contactName}</p>
                <p className="truncate text-sm text-gray-500">{r.property.title}</p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <p className="mt-2 text-sm text-gray-600">
              {ghs(r.askingPrice)}
              {r.offer && <span className="font-bold text-brand-600"> · offer {ghs(r.offer.amount)}</span>} · {formatRelative(r.createdAt)}
            </p>
          </button>
        )}
      />

      <Detail
        open={Boolean(open)}
        onClose={() => setOpenId(null)}
        size="lg"
        title={open ? `Purchase request from ${open.contactName}` : ""}
        description={open && `Requested ${formatDate(open.createdAt)}`}
        footer={
          open && (
            <>
              {whatsapp && (
                <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hello ${open.contactName}, about your request to buy "${open.property.title}"...`)}`} target="_blank" rel="noopener noreferrer" className="btn bg-emerald-600 text-white hover:bg-emerald-700">
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
            <StatusSteps kind="sale" status={open.statusKey} />
            <div className="rounded-xl bg-brand-50 p-4"><p className="workspace-eyebrow">Purchase summary</p><p className="mt-2 text-2xl font-semibold text-gray-900">{ghs(open.askingPrice)}</p><div className="mt-3 flex flex-wrap gap-2"><StatusBadge status={open.status} /><StatusBadge status={open.paymentStatus} /></div><p className="mt-3 text-xs leading-relaxed text-gray-600">{closed ? "This request is closed. Its history is available below." : paymentConfirmed ? "Payment is confirmed. Complete the sale when the handover is finished." : "Follow up with the buyer and confirm payment only after it is received."}</p></div>
            <Link to={`/house/${open.property.id}`} className="flex items-center gap-3 rounded-lg p-2 ring-1 ring-gray-200 transition hover:ring-brand-200">
              {open.property.image && <img src={open.property.image} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" />}
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{open.property.title}</p>
                <p className="text-sm text-gray-500">{open.property.location}</p>
              </div>
            </Link>

            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-gray-500">Customer</dt>
                <dd className="font-semibold text-gray-900">{open.contactName}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Phone</dt>
                <dd><a href={`tel:${open.contactPhone.replace(/\s+/g, "")}`} className="font-semibold text-brand-600 hover:underline">{open.contactPhone}</a></dd>
              </div>
              <div>
                <dt className="text-gray-500">Email</dt>
                <dd><a href={`mailto:${open.contactEmail}`} className="font-semibold break-all text-brand-600 hover:underline">{open.contactEmail}</a></dd>
              </div>
              <div>
                <dt className="text-gray-500">Asking price</dt>
                <dd className="font-semibold text-gray-900">{ghs(open.askingPrice)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Offer amount</dt>
                <dd className="font-bold text-brand-600">{open.offer ? `${ghs(open.offer.amount)} (${open.offer.status})` : "No offer"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Assigned to</dt>
                <dd className="font-semibold text-gray-900">{open.ownerType === "admin" ? `${siteName} admin` : open.owner.name}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd className="mt-0.5"><StatusBadge status={open.status} /></dd>
              </div>
              <div>
                <dt className="text-gray-500">Payment</dt>
                <dd className="mt-0.5"><StatusBadge status={open.paymentStatus} dot={false} /></dd>
              </div>
              {open.paymentConfirmedAt && (
                <div>
                  <dt className="text-gray-500">Paid at office</dt>
                  <dd className="font-semibold text-gray-900">
                    {ghs(open.amountPaid)} · {formatDate(open.paymentConfirmedAt)}
                    {open.paymentConfirmedBy && <span className="block text-xs font-normal text-gray-500">by {open.paymentConfirmedBy.name}</span>}
                  </dd>
                </div>
              )}
            </dl>

            {open.message && (
              <div>
                <p className="text-sm font-semibold text-gray-900">Customer message</p>
                <p className="mt-2 rounded-lg bg-brand-50/60 p-4 text-sm leading-relaxed whitespace-pre-line text-gray-700">{open.message}</p>
              </div>
            )}

            {!closed && (
              <div className="space-y-3 rounded-lg p-4 ring-1 ring-gray-200">
                <p className="text-sm font-semibold text-gray-900">Update this request</p>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} aria-label="New status" className="field">
                    <option value="">Change status...</option>
                    {SETTABLE.filter((s) => s !== open.statusKey && !(paymentConfirmed && ["payment_pending", "cancelled", "rejected"].includes(s))).map((s) => (
                      <option key={s} value={s}>{SALE_STATUS[s]}</option>
                    ))}
                  </select>
                  <button onClick={applyStatus} disabled={!nextStatus || Boolean(busy)} className="btn btn-primary">
                    {busy === "status" && <Loader2 className="h-4 w-4 animate-spin" />}
                    {busy === "status" ? "Updating..." : "Update status"}
                  </button>
                </div>
                <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} placeholder="Note for the customer (optional), e.g. office address and opening hours" className="field resize-none" />

                <div className="grid gap-2 border-t border-gray-100 pt-3 sm:grid-cols-2">
                  {!paymentConfirmed ? (
                    <button onClick={() => { setPaidAmount(""); setConfirm({ kind: "payment" }); }} disabled={Boolean(busy)} className="btn bg-emerald-600 text-white hover:bg-emerald-700 sm:col-span-2">
                      <Wallet className="h-4 w-4" />
                      Confirm payment received at office
                    </button>
                  ) : (
                    <button onClick={() => setConfirm({ kind: "complete" })} disabled={Boolean(busy)} className="btn btn-dark sm:col-span-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Complete sale & mark property sold
                    </button>
                  )}
                </div>
              </div>
            )}

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
        onConfirm={() => perform(confirm.kind, confirm.status)}
        disabled={Boolean(busy) || (confirm?.kind === "payment" && paidAmount !== "" && !(Number(paidAmount) > 0))}
        title={confirmCopy?.title}
        description={confirmCopy?.description}
        confirmLabel={busy ? "Saving..." : confirmCopy?.label}
        tone={confirmCopy?.tone}
      >
        {confirm?.kind === "payment" && (
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Amount received (GHS)</span>
            <input type="number" min="1" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder={`${open?.askingPrice ?? ""} (asking price)`} className="field" />
          </label>
        )}
      </ConfirmDialog>
    </>
  );
};

export default SaleRequestsBoard;
