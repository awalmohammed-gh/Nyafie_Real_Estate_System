import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building, ChevronDown, Info, MessageCircle, ShieldAlert, XCircle } from "lucide-react";
import AccountShell from "../../components/account/AccountShell";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import PageLoader from "../../components/ui/PageLoader";
import StatusBadge from "../../components/ui/StatusBadge";
import HistoryTimeline from "../../components/offers/HistoryTimeline";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { saleRequestApi } from "../../frontApi";
import { formatDate } from "../../utils/date";
import { usePlatform } from "../../context/usePlatform";
import { cloudImage } from "../../utils/cloudImage";

const ghs = (value) => `₵${Number(value).toLocaleString()}`;
const CLOSED = ["completed", "cancelled", "rejected"];

// What each purchase status means for the customer
const statusHelp = {
  pending: "Waiting for the owner to contact you. Please don't make any payment yet.",
  contacted: "The owner has been in touch about your request.",
  offer_received: "The owner is reviewing your offer.",
  negotiating: "You're negotiating the price with the owner.",
  approved: "Your request was approved. The owner will send payment instructions.",
  payment_pending: "Agree with the owner how to pay (in chat, by phone or in person). Only pay the owner or agent shown on this page, and keep a receipt.",
  paid_at_office: "The owner confirmed your payment and is completing the sale.",
  completed: "The sale is complete. Congratulations on your new property!",
  cancelled: "This purchase request was cancelled.",
  rejected: "The owner declined this purchase request.",
};

// "Buy Now" requests the customer has made (sale properties)
const MyPurchases = () => {
  const { siteName } = usePlatform();
  const run = useAsyncAction();
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    saleRequestApi.getMySaleRequests().then(setRequests).catch((err) => setError(err.message));
  }, []);

  const cancel = async () => {
    setBusy(true);
    const { ok, result } = await run(saleRequestApi.cancelSaleRequest(cancelling.id), { success: "Purchase request cancelled" });
    if (ok) setRequests((prev) => prev.map((r) => (r.id === result.id ? result : r)));
    setBusy(false);
    setCancelling(null);
  };

  return (
    <AccountShell title="My Purchases" description="Properties you've asked to buy, and where each request stands.">
      <p className="mb-6 flex items-start gap-3 rounded-2xl bg-sky-50 p-4 text-sm text-sky-800">
        <Info className="mt-0.5 h-5 w-5 shrink-0" />
        Property purchases aren't paid online on {siteName}: you agree the payment directly with the owner. Never pay anyone before the owner has confirmed your request here, and only pay the owner or agent shown on the listing.
      </p>

      {error ? (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : !requests ? (
        <PageLoader label="Loading your purchases..." />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={Building}
          title="No purchase requests yet"
          description="Open a property for sale to contact the listing agent, discuss the asking price or make an offer."
          action={<Link to="/sale" className="btn btn-primary">Browse properties for sale</Link>}
        />
      ) : (
        <ul className="space-y-4">
          {requests.map((req) => {
            const open = openId === req.id;
            const closed = CLOSED.includes(req.statusKey);
            return (
              <li key={req.id} className="rounded-3xl bg-white p-4 ring-1 ring-gray-200 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <Link to={`/house/${req.property.id}`} className="shrink-0">
                    {req.property.image ? (
                      <img src={cloudImage(req.property.image, 400)} alt="" className="aspect-16/9 w-full rounded-2xl object-cover sm:h-28 sm:w-40" />
                    ) : (
                      <div className="grid h-28 w-40 place-items-center rounded-2xl bg-gray-100 text-xs text-gray-400">Removed</div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900">{req.property.title}</p>
                        <p className="text-sm text-gray-500">
                          {req.property.location} · {req.owner?.name}
                        </p>
                      </div>
                      <StatusBadge status={req.status} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-xs text-gray-500">Asking price</dt>
                        <dd className="font-semibold text-gray-900">{ghs(req.askingPrice)}</dd>
                      </div>
                      {req.offer && (
                        <div>
                          <dt className="text-xs text-gray-500">Your offer</dt>
                          <dd className="font-bold text-brand-600">{ghs(req.offer.amount)}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-xs text-gray-500">Payment</dt>
                        <dd className="mt-0.5"><StatusBadge status={req.paymentStatus} /></dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Requested</dt>
                        <dd className="font-semibold text-gray-900">{formatDate(req.createdAt)}</dd>
                      </div>
                    </dl>

                    {req.statusKey === "payment_pending" ? (
                      <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        {statusHelp.payment_pending}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-gray-600">{statusHelp[req.statusKey]}</p>
                    )}
                    {req.paymentConfirmedAt && (
                      <p className="mt-1 text-xs text-gray-400">
                        {ghs(req.amountPaid)} confirmed {formatDate(req.paymentConfirmedAt)}
                        {req.paymentConfirmedBy && ` by ${req.paymentConfirmedBy.name}`}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {req.conversationId && (
                        <Link to={`/account/messages?c=${req.conversationId}`} className="btn btn-primary px-4 py-2 text-xs">
                          <MessageCircle className="h-3.5 w-3.5" />
                          Chat with {req.owner?.name}
                        </Link>
                      )}
                      {!closed && req.paymentStatusKey !== "confirmed" && (
                        <button onClick={() => setCancelling(req)} className="btn btn-light px-4 py-2 text-xs text-red-600">
                          <XCircle className="h-3.5 w-3.5" />
                          Cancel request
                        </button>
                      )}
                      <button onClick={() => setOpenId(open ? null : req.id)} aria-expanded={open} className="ml-auto flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900">
                        History
                        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>
                </div>
                {open && <HistoryTimeline history={req.history} className="mt-5 ml-2" />}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        onConfirm={cancel}
        disabled={busy}
        title="Cancel purchase request?"
        description={cancelling ? `Your request to buy "${cancelling.property.title}" will be withdrawn and the owner will be notified.` : ""}
        confirmLabel={busy ? "Cancelling..." : "Cancel request"}
      />
    </AccountShell>
  );
};

export default MyPurchases;
