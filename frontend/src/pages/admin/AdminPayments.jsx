import { useEffect, useState } from "react";
import { RotateCcw, ShieldAlert, Wallet } from "lucide-react";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FilterTabs from "../../components/ui/FilterTabs";
import { ErrorState, TableSkeleton } from "../../components/dashboard/States";
import TransactionNav from "../../components/offers/TransactionNav";
import SearchInput from "../../components/ui/SearchInput";
import StatusBadge from "../../components/ui/StatusBadge";
import RefundDialog from "../../components/admin/RefundDialog";
import { usePlatform } from "../../context/usePlatform";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAdminData } from "../../hooks/useAdminData";
import { adminApi, paymentApi } from "../../frontApi";
import { formatDate, formatTime } from "../../utils/date";
import { formatGhs } from "../../utils/property";

const cap = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);
const TYPE_LABEL = { rental: "Rental", sale: "Sale", subscription: "Subscription" };
// How a payment was made: sales are paid to the owner (older ones were paid at the office)
const METHOD_LABEL = { Direct: "Paid to owner", Office: "Office" };
const TYPE_TONE = { rental: "sky", sale: "green", subscription: "brand" };
const FLAGGED = ["duplicate", "refund_required"];
// Flagged Paystack charges can be refunded; once a refund exists it can be followed up from here
const refundAction = (p) => (p.refund && p.refund.status !== "failed" ? "manage" : p.method === "Paystack" && FLAGGED.includes(p.statusKey) ? "refund" : null);

// Disputes someone still has to look at, ones waiting for NyaFie's answer first, then the nearest deadline
const needsAttention = (p) => ["open", "check"].includes(p.dispute?.outcome);
const byUrgency = (a, b) => Number(b.dispute.awaitingAnswer) - Number(a.dispute.awaitingAnswer) || new Date(a.dispute.dueAt || "9999-12-31") - new Date(b.dispute.dueAt || "9999-12-31");
const disputeDetail = ({ dispute }) => {
  if (dispute.awaitingAnswer) return dispute.dueAt ? `Answer by ${formatDate(dispute.dueAt)}, ${formatTime(dispute.dueAt)}` : "Waiting for your answer";
  if (dispute.outcome === "open") return "With Paystack or the bank";
  if (dispute.outcome === "lost") return `${formatGhs(dispute.lostAmount)} returned`;
  return dispute.outcome === "check" ? "See the Paystack dashboard" : "";
};
const DisputeStatus = ({ payment }) => (
  <div>
    <StatusBadge status={payment.dispute.label} dot={false} />
    {disputeDetail(payment) && <p className="mt-1 text-xs whitespace-nowrap text-gray-500">{disputeDetail(payment)}</p>}
  </div>
);

// Every payment on the platform: rentals (Paystack), sales (paid to the owner) and agent subscriptions
const AdminPayments = () => {
  const { payments, users } = useAdminData();
  const { refreshPayments } = usePlatform();
  const provider = useApiQuery("payment-status", adminApi.getPaymentStatus);
  const [refunding, setRefunding] = useState(null);
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    paymentApi.getAdminPayments().then(setRecords).catch((err) => setError(err.message));
  }, [attempt]);

  const header = (
    <>
      <AdminPageTitle title="Payments" description="Rental payments verified with Paystack, sale payments confirmed by the owner, and agent subscriptions." />
      <TransactionNav scope="admin" />
    </>
  );
  const retry = () => {
    setError("");
    setAttempt((a) => a + 1);
  };
  const refundChanged = () => {
    setRefunding(null);
    setAttempt((a) => a + 1);
    refreshPayments().catch(() => {});
  };
  if (error) return <>{header}<ErrorState title="Couldn't load payments" message={error} onRetry={retry} /></>;
  if (!records) return <>{header}<TableSkeleton /></>;

  const all = [
    // One record per Paystack attempt or confirmed sale payment
    ...records.map((p) => ({
      id: `p-${p.id}`,
      source: "payment",
      recordId: p.id,
      statusKey: p.statusKey,
      refund: p.refund,
      dispute: p.dispute,
      received: p.received,
      environment: p.environment,
      type: p.kind,
      reference: p.reference,
      payer: p.customer,
      item: p.property,
      listing: `${p.ownerType === "admin" ? "Admin listing" : `Agent listing · ${p.owner}`}${p.confirmedBy ? ` · confirmed by ${p.confirmedBy}` : ""}`,
      amount: p.amount,
      method: p.method,
      status: p.status,
      note: p.note,
      date: p.paidAt || p.createdAt,
    })),
    ...payments.map((p) => ({
      id: `s-${p.id}`,
      source: "subscription",
      recordId: p.id,
      statusKey: p.status === "refund_required" ? "refund_required" : p.status,
      refund: p.refund,
      dispute: p.dispute,
      received: p.received,
      environment: p.environment,
      type: "subscription",
      reference: p.reference,
      payer: users.find((u) => u.id === p.userId)?.name || "Deleted user",
      item: "Agent subscription",
      listing: "",
      amount: p.amount,
      method: p.method,
      status: p.status === "refund_required" ? "Refund required" : p.status === "refunded" ? "Refunded" : cap(p.status),
      note: p.note,
      date: p.createdAt,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const q = query.trim().toLowerCase();
  const disputed = all.filter((p) => p.dispute);
  const waiting = disputed.filter(needsAttention).sort(byUrgency);
  const rows = all.filter((p) => type === "all" || (type === "disputed" ? p.dispute : p.type === type)).filter((p) => !q || `${p.reference} ${p.payer} ${p.item}`.toLowerCase().includes(q));
  const paidTotal = all.filter((p) => p.status === "Paid" && (type === "all" || (type === "disputed" ? p.dispute : p.type === type))).reduce((s, p) => s + p.received, 0);

  const columns = [
    { key: "type", header: "Type", render: (p) => <StatusBadge status={TYPE_LABEL[p.type]} tone={TYPE_TONE[p.type]} dot={false} /> },
    {
      key: "method",
      header: "Method",
      render: (p) => (
        <span className="whitespace-nowrap text-gray-600">
          {METHOD_LABEL[p.method] || p.method}
          {/* Once live, older test-mode checkouts stay visible but are not real money */}
          {p.method === "Paystack" && provider.data?.environment === "live" && p.environment === "test" && <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Test mode</span>}
        </span>
      ),
    },
    {
      key: "item",
      header: "For",
      render: (p) => (
        <div className="min-w-0">
          <p className="max-w-52 truncate font-semibold text-gray-900">{p.item}</p>
          {p.listing && <p className="truncate text-xs text-gray-400">{p.listing}</p>}
          {p.note && <p className="truncate text-xs text-amber-700">{p.note}</p>}
        </div>
      ),
    },
    { key: "payer", header: "Paid by", render: (p) => <span className="whitespace-nowrap text-gray-700">{p.payer}</span> },
    { key: "amount", header: "Amount", render: (p) => <span className="font-bold whitespace-nowrap text-gray-900">{formatGhs(p.amount)}</span> },
    { key: "reference", header: "Reference", render: (p) => <span className="font-mono text-xs text-gray-500">{p.reference}</span> },
    { key: "date", header: "Date", render: (p) => <span className="whitespace-nowrap text-gray-600">{formatDate(p.date)}</span> },
    {
      key: "status",
      header: "Status",
      render: (p) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={p.status} />
          {p.refund && p.refund.status !== "processed" && <StatusBadge status={p.refund.label} dot={false} />}
          {p.dispute && <DisputeStatus payment={p} />}
        </div>
      ),
    },
    {
      key: "action",
      header: <span className="sr-only">Refund</span>,
      align: "right",
      render: (p) => refundAction(p) && (
        <button type="button" onClick={() => setRefunding(p)} className="btn btn-light whitespace-nowrap px-3 py-1.5 text-xs">
          <RotateCcw size={14} aria-hidden="true" />{refundAction(p) === "refund" ? "Refund" : "Manage refund"}
        </button>
      ),
    },
  ];

  return (
    <>
      <AdminPageTitle
        title="Payments"
        description="Rental payments verified with Paystack, sale payments confirmed by the owner, and agent subscriptions."
        action={<p className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-500">Paid <span className="font-semibold text-gray-900 tabular-nums">{formatGhs(paidTotal)}</span></p>}
      />
      <TransactionNav scope="admin" />
      {waiting.length > 0 && (
        <div className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{waiting.length === 1 ? "1 payment dispute needs attention" : `${waiting.length} payment disputes need attention`}</p>
            <p className="mt-1">Answer disputes in the Paystack dashboard. One that isn&apos;t answered in time is lost and the money goes back to the customer.</p>
            <ul className="mt-2 space-y-1">
              {waiting.slice(0, 3).map((p) => <li key={p.id}><span className="font-mono text-xs">{p.reference}</span> · {formatGhs(p.dispute.amount ?? p.amount)} · {disputeDetail(p)}</li>)}
            </ul>
            {type !== "disputed" && <button type="button" onClick={() => setType("disputed")} className="mt-2 font-semibold underline">Show disputed payments</button>}
          </div>
        </div>
      )}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          label="Payment type"
          value={type}
          onChange={setType}
          tabs={[
            { id: "all", label: "All", count: all.length },
            { id: "rental", label: "Rentals", count: all.filter((p) => p.type === "rental").length },
            { id: "sale", label: "Sales", count: all.filter((p) => p.type === "sale").length },
            { id: "subscription", label: "Subscriptions", count: all.filter((p) => p.type === "subscription").length },
            ...(disputed.length || type === "disputed" ? [{ id: "disputed", label: "Disputed", count: disputed.length }] : []),
          ]}
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Search payments" className="lg:w-72" />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        minWidth={900}
        empty={<EmptyState icon={Wallet} title="No payments yet" description="Rental and subscription payments appear here once checkout starts." />}
        mobileCard={(p) => (
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{p.item}</p>
                <p className="truncate text-sm text-gray-500">{p.payer} · {formatDate(p.date)}</p>
              </div>
              <StatusBadge status={p.status} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-gray-900">{formatGhs(p.amount)}</p>
              {p.refund && p.refund.status !== "processed" && <StatusBadge status={p.refund.label} dot={false} />}
            </div>
            {p.dispute && <div className="mt-2"><DisputeStatus payment={p} /></div>}
            {refundAction(p) && (
              <button type="button" onClick={() => setRefunding(p)} className="btn btn-light mt-3 w-full text-sm">
                <RotateCcw size={15} aria-hidden="true" />{refundAction(p) === "refund" ? "Refund" : "Manage refund"}
              </button>
            )}
          </div>
        )}
      />
      <RefundDialog key={refunding?.id || "none"} payment={refunding} onClose={() => setRefunding(null)} onChanged={refundChanged} />
    </>
  );
};

export default AdminPayments;
