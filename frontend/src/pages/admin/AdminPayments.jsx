import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FilterTabs from "../../components/ui/FilterTabs";
import { ErrorState, TableSkeleton } from "../../components/dashboard/States";
import TransactionNav from "../../components/offers/TransactionNav";
import SearchInput from "../../components/ui/SearchInput";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminData } from "../../hooks/useAdminData";
import { paymentApi } from "../../frontApi";
import { formatDate } from "../../utils/date";

const ghs = (value) => `₵${Number(value).toLocaleString()}`;
const cap = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);
const TYPE_LABEL = { rental: "Rental", sale: "Sale (office)", subscription: "Subscription" };
const TYPE_TONE = { rental: "sky", sale: "green", subscription: "brand" };

// Every payment on the platform: rentals (Paystack), sales (paid at the office) and agent subscriptions
const AdminPayments = () => {
  const { payments, users } = useAdminData();
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
      <AdminPageTitle title="Payments" description="Rental payments verified with Paystack, sale payments confirmed at the office, and agent subscriptions." />
      <TransactionNav scope="admin" />
    </>
  );
  const retry = () => {
    setError("");
    setAttempt((a) => a + 1);
  };
  if (error) return <>{header}<ErrorState title="Couldn't load payments" message={error} onRetry={retry} /></>;
  if (!records) return <>{header}<TableSkeleton /></>;

  const all = [
    // One record per Paystack attempt or confirmed office payment
    ...records.map((p) => ({
      id: `p-${p.id}`,
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
      type: "subscription",
      reference: p.reference,
      payer: users.find((u) => u.id === p.userId)?.name || "Deleted user",
      item: "Agent subscription",
      listing: "",
      amount: p.amount,
      method: p.method,
      status: cap(p.status),
      date: p.createdAt,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const q = query.trim().toLowerCase();
  const rows = all.filter((p) => type === "all" || p.type === type).filter((p) => !q || `${p.reference} ${p.payer} ${p.item}`.toLowerCase().includes(q));
  const paidTotal = all.filter((p) => p.status === "Paid" && (type === "all" || p.type === type)).reduce((s, p) => s + p.amount, 0);

  const columns = [
    { key: "type", header: "Type", render: (p) => <StatusBadge status={TYPE_LABEL[p.type]} tone={TYPE_TONE[p.type]} dot={false} /> },
    { key: "method", header: "Method", render: (p) => <span className="whitespace-nowrap text-gray-600">{p.method}</span> },
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
    { key: "amount", header: "Amount", render: (p) => <span className="font-bold whitespace-nowrap text-gray-900">{ghs(p.amount)}</span> },
    { key: "reference", header: "Reference", render: (p) => <span className="font-mono text-xs text-gray-500">{p.reference}</span> },
    { key: "date", header: "Date", render: (p) => <span className="whitespace-nowrap text-gray-600">{formatDate(p.date)}</span> },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <>
      <AdminPageTitle
        title="Payments"
        description="Rental payments verified with Paystack, sale payments confirmed at the office, and agent subscriptions."
        action={<p className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-500">Paid <span className="font-semibold text-gray-900 tabular-nums">{ghs(paidTotal)}</span></p>}
      />
      <TransactionNav scope="admin" />
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
            <p className="mt-2 text-sm font-bold text-gray-900">{ghs(p.amount)}</p>
          </div>
        )}
      />
    </>
  );
};

export default AdminPayments;
