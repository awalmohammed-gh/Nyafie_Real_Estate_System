import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Eye, HandCoins, Loader2, MessageCircle, Repeat, X } from "lucide-react";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import FilterTabs from "../ui/FilterTabs";
import SidePanel from "../ui/SidePanel";
import AdminRecordModal from "../admin/AdminRecordModal";
import WorkspaceStats from "../agent/WorkspaceStats";
import { ErrorState, TableSkeleton } from "../dashboard/States";
import StatusSteps from "./StatusSteps";
import Filters from "./Filters";
import { useTransactions } from "../../context/useTransactions";
import SearchInput from "../ui/SearchInput";
import StatusBadge from "../ui/StatusBadge";
import WhatsAppIcon from "../ui/WhatsAppIcon";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { offerApi } from "../../frontApi";
import { formatDate, formatRelative, isWithinDays } from "../../utils/date";
import { toWhatsAppNumber } from "../../utils/whatsapp";

const STATUSES = ["Pending", "Countered", "Accepted", "Rejected", "Withdrawn"];
const ghs = (value) => `₵${Number(value).toLocaleString()}`;

/**
 * Offers received on listings. scope "agent": the agent's own listings only
 * (enforced by the API). scope "admin": every offer, with extra filters.
 */
const OffersBoard = ({ scope }) => {
  const isAdmin = scope === "admin";
  const Detail = isAdmin ? AdminRecordModal : SidePanel;
  const run = useAsyncAction();
  const { offers, loading, error: loadError, reload, updateTransaction } = useTransactions();
  const [params] = useSearchParams();
  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");
  const [ownerId, setOwnerId] = useState("all");
  const [propertyId, setPropertyId] = useState(params.get("property") || "all"); // set by links from a property page
  const [range, setRange] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [counter, setCounter] = useState({ amount: "", message: "", show: false });
  const [busy, setBusy] = useState("");

  const retry = reload;
  if (loadError) return <ErrorState title="Couldn't load offers" message={loadError} onRetry={retry} />;
  if (loading) return <TableSkeleton />;

  const owners = [...new Map(offers.map((o) => [o.owner.id, o.owner])).values()];
  const scoped = offers
    .filter((o) => ownerId === "all" || o.owner.id === ownerId)
    .filter((o) => propertyId === "all" || o.property.id === propertyId)
    .filter((o) => range === "all" || isWithinDays(o.createdAt, Number(range)));
  const q = query.trim().toLowerCase();
  const rows = scoped
    .filter((o) => status === "All" || o.status === status)
    .filter((o) => !q || `${o.customer.name} ${o.property.title} ${o.message}`.toLowerCase().includes(q));
  const propertyOptions = [...new Map(offers.map((o) => [o.property.id, o.property])).values()];
  const counts = { All: scoped.length, ...Object.fromEntries(STATUSES.map((s) => [s, scoped.filter((o) => o.status === s).length])) };

  const open = openId && offers.find((o) => o.id === openId);
  const canRespond = open && (open.status === "Pending" || open.status === "Countered");
  // The admin inbox only holds chats about HomeBase listings
  const chatLink = open && (isAdmin ? open.ownerType === "admin" && `/admin/messages?c=${open.conversationId}` : `/agent/messages?c=${open.conversationId}`);
  const whatsapp = open?.customer.phone && toWhatsAppNumber(open.customer.phone);

  const replace = (updated) => {
    updateTransaction("offers", updated);
    reload(); // refresh dashboard counts and sidebar badges
  };

  const respond = async (action) => {
    setBusy(action);
    const request = action === "counter" ? offerApi.counterOffer(open.id, Number(counter.amount), counter.message) : offerApi.updateOfferStatus(open.id, action);
    const labels = { accept: "Offer accepted", reject: "Offer declined", counter: "Counter offer sent" };
    const { ok, result } = await run(request, { success: labels[action], description: `${open.customer.name} has been notified in chat.` });
    if (ok) {
      replace(result);
      setCounter({ amount: "", message: "", show: false });
    }
    setBusy("");
  };

  const columns = [
    {
      key: "customer",
      header: "Customer",
      render: (o) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{o.customer.name}</p>
          <p className="truncate text-xs text-gray-500">{o.customer.email}</p>
        </div>
      ),
    },
    { key: "property", header: "Property", render: (o) => <span className="block max-w-48 truncate text-gray-700">{o.property.title}</span> },
    ...(isAdmin
      ? [
          {
            key: "listing",
            header: "Listed by",
            render: (o) => (
              <div className="min-w-0">
                <p className="truncate text-gray-700">{o.owner.name}</p>
                <p className="text-xs text-gray-400">{o.ownerType === "admin" ? "Admin listing" : "Agent listing"}</p>
              </div>
            ),
          },
        ]
      : []),
    { key: "asking", header: "Asking", render: (o) => <span className="whitespace-nowrap text-gray-600">{ghs(o.askingPrice)}</span> },
    { key: "offer", header: "Offer", render: (o) => <span className="font-bold whitespace-nowrap text-brand-600">{ghs(o.amount)}</span> },
    { key: "date", header: "Date", render: (o) => <span className="whitespace-nowrap text-gray-600">{formatRelative(o.createdAt)}</span> },
    { key: "status", header: "Status", render: (o) => <StatusBadge status={o.status} /> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      render: (o) => (
        <button onClick={() => setOpenId(o.id)} aria-label={`View offer from ${o.customer.name}`} className="grid h-9 w-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900">
          <Eye className="h-4.5 w-4.5" />
        </button>
      ),
    },
  ];

  return (
    <>
      {!isAdmin && <WorkspaceStats className="mb-6" items={[
        { label: "All offers", value: offers.length, note: "Across your properties" },
        { label: "Needs a response", value: offers.filter((o) => ["Pending", "Countered"].includes(o.status)).length, note: "Keep negotiations moving" },
        { label: "Accepted", value: offers.filter((o) => o.status === "Accepted").length, note: "Ready for the next step" },
        { label: "Closed", value: offers.filter((o) => ["Rejected", "Withdrawn"].includes(o.status)).length, note: "Completed negotiations" },
      ]} />}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          label="Offer status"
          value={status}
          onChange={setStatus}
          tabs={["All", ...STATUSES].map((s) => ({ id: s, label: s, count: counts[s] }))}
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Search offers" className="lg:w-72" />
      </div>

      <Filters isAdmin={isAdmin} owners={owners} ownerId={ownerId} setOwnerId={setOwnerId} properties={propertyOptions} propertyId={propertyId} setPropertyId={setPropertyId} range={range} setRange={setRange} />

      <DataTable
        tableFrom={isAdmin ? "md" : "xl"}
        columns={columns}
        rows={rows}
        onRowClick={(o) => setOpenId(o.id)}
        minWidth={isAdmin ? 920 : 800}
        empty={
          <EmptyState
            icon={HandCoins}
            title={offers.length ? "No offers match" : "No offers yet"}
            description={offers.length ? "Try a different filter." : "When customers make offers on properties for sale, they appear here."}
          />
        }
        mobileCard={(o) => (
          <button onClick={() => setOpenId(o.id)} className="w-full text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{o.customer.name}</p>
                <p className="truncate text-sm text-gray-500">{o.property.title}</p>
              </div>
              <StatusBadge status={o.status} />
            </div>
            <p className="mt-2 text-sm">
              <span className="font-bold text-brand-600">{ghs(o.amount)}</span>
              <span className="text-gray-400"> · asking {ghs(o.askingPrice)} · {formatRelative(o.createdAt)}</span>
            </p>
          </button>
        )}
      />

      <Detail
        open={Boolean(open)}
        onClose={() => {
          setOpenId(null);
          setCounter({ amount: "", message: "", show: false });
        }}
        title={open ? `Offer from ${open.customer.name}` : ""}
        description={open && `Received ${formatDate(open.createdAt)}`}
        footer={
          open && (
            <>
              {whatsapp && (
                <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hello ${open.customer.name}, about your offer on "${open.property.title}"...`)}`} target="_blank" rel="noopener noreferrer" className="btn bg-emerald-600 text-white hover:bg-emerald-700">
                  <WhatsAppIcon />
                  WhatsApp
                </a>
              )}
              {chatLink && open.conversationId && (
                <Link to={chatLink} className="btn btn-light">
                  <MessageCircle className="h-4 w-4" />
                  Chat
                </Link>
              )}
            </>
          )
        }
      >
        {open && (
          <div className="space-y-5">
            <StatusSteps kind="offer" status={open.status.toLowerCase()} />
            <div className="rounded-xl bg-brand-50 p-4"><p className="workspace-eyebrow">Offer summary</p><p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">{ghs(open.amount)}</p><p className="mt-2 text-xs text-gray-500">Asking {ghs(open.askingPrice)}{open.askingPrice > 0 && ` · ${Math.abs(Math.round((open.amount - open.askingPrice) / open.askingPrice * 100))}% ${open.amount >= open.askingPrice ? "above or equal to" : "below"} asking price`}</p></div>
            <Link to={`/house/${open.property.id}`} className="flex items-center gap-3 rounded-lg p-2 ring-1 ring-gray-200 transition hover:ring-brand-200">
              {open.property.image && <img src={open.property.image} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" />}
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{open.property.title}</p>
                <p className="text-sm text-gray-500">{open.property.location}{isAdmin && ` · ${open.ownerType === "admin" ? "Admin listing" : `Agent listing (${open.owner.name})`}`}</p>
              </div>
            </Link>

            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-gray-500">Asking price</dt>
                <dd className="font-semibold text-gray-900">{ghs(open.askingPrice)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Offer</dt>
                <dd className="text-lg font-semibold text-brand-600">{ghs(open.amount)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd className="mt-0.5"><StatusBadge status={open.status} /></dd>
              </div>
              {open.counterAmount && (
                <div>
                  <dt className="text-gray-500">Your counter</dt>
                  <dd className="font-bold text-sky-700">{ghs(open.counterAmount)}</dd>
                </div>
              )}
              <div className="col-span-2">
                <dt className="text-gray-500">Customer</dt>
                <dd className="font-semibold break-all text-gray-900">
                  {open.customer.email}
                  {open.customer.phone && ` · ${open.customer.phone}`}
                </dd>
              </div>
            </dl>

            {open.message && (
              <div>
                <p className="text-sm font-semibold text-gray-900">Message</p>
                <p className="mt-2 rounded-lg bg-brand-50/60 p-4 text-sm leading-relaxed whitespace-pre-line text-gray-700">{open.message}</p>
              </div>
            )}

            {canRespond && (
              <div>
                <p className="text-sm font-semibold text-gray-900">Respond</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button onClick={() => respond("accept")} disabled={Boolean(busy)} className="btn bg-emerald-600 px-3 text-white hover:bg-emerald-700">
                    {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Accept
                  </button>
                  <button onClick={() => respond("reject")} disabled={Boolean(busy)} className="btn btn-light px-3 text-red-600">
                    {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    Reject
                  </button>
                  <button onClick={() => setCounter((c) => ({ ...c, show: !c.show }))} disabled={Boolean(busy)} className={`btn btn-light px-3 ${counter.show ? "ring-brand-300" : ""}`}>
                    <Repeat className="h-4 w-4" />
                    Counter
                  </button>
                </div>
                {counter.show && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      respond("counter");
                    }}
                    className="mt-3 space-y-3 rounded-lg bg-gray-50 p-4"
                  >
                    <label className="block text-sm">
                      <span className="mb-1.5 block font-medium text-gray-700">Counter offer (GHS)</span>
                      <input type="number" min="1" required value={counter.amount} onChange={(e) => setCounter((c) => ({ ...c, amount: e.target.value }))} className="field" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1.5 block font-medium text-gray-700">Note <span className="font-normal text-gray-400">(optional)</span></span>
                      <textarea rows={2} value={counter.message} onChange={(e) => setCounter((c) => ({ ...c, message: e.target.value.slice(0, 1000) }))} className="field resize-none" />
                    </label>
                    <button type="submit" disabled={Boolean(busy)} className="btn btn-primary w-full">
                      {busy === "counter" && <Loader2 className="h-4 w-4 animate-spin" />}
                      Send counter offer
                    </button>
                  </form>
                )}
                <p className="mt-2 text-xs text-gray-500">Accepting marks the property “Under Offer”. Mark it sold from the listing once the sale completes.</p>
              </div>
            )}
          </div>
        )}
      </Detail>
    </>
  );
};

export default OffersBoard;
