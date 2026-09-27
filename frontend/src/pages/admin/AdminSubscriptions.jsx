import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BadgeCheck, CalendarPlus, Clock, CreditCard, Eye, Hourglass, Repeat, Wallet, XCircle, Zap } from "lucide-react";
import { useAdminData } from "../../hooks/useAdminData";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import AdminStat from "../../components/admin/AdminStat";
import SubscriptionDialogs from "../../components/admin/SubscriptionDialogs";
import DataTable from "../../components/ui/DataTable";
import FilterTabs from "../../components/ui/FilterTabs";
import SearchInput from "../../components/ui/SearchInput";
import StatusBadge from "../../components/ui/StatusBadge";
import ActionMenu from "../../components/ui/ActionMenu";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import { formatDate } from "../../utils/date";
import { formatCedis } from "../../utils/reports";

const subTone = { active: "green", expiring: "amber", expired: "red", cancelled: "gray", pending: "amber" };
const payTone = { paid: "green", pending: "amber", failed: "red", waived: "gray", refunded: "gray" };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "—");

const AdminSubscriptions = () => {
  const { agents, payments, getPlan } = useAdminData();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get("status") || "all");
  const [query, setQuery] = useState("");
  const [viewingId, setViewingId] = useState(null);
  const [action, setAction] = useState(null);

  const subscribed = agents.filter((a) => a.subscription);
  const matches = (a) => status === "all" || a.sub.status === status || (status === "active" && a.sub.isActive);
  const q = query.trim().toLowerCase();
  const rows = subscribed
    .filter(matches)
    .filter((a) => !q || `${a.name} ${a.email} ${a.subscription.planName}`.toLowerCase().includes(q))
    .sort((a, b) => new Date(a.subscription.expiryDate) - new Date(b.subscription.expiryDate));

  const count = (fn) => subscribed.filter(fn).length;
  const thisMonth = payments.filter((p) => p.status === "paid" && new Date(p.createdAt).getMonth() === new Date().getMonth() && new Date(p.createdAt).getFullYear() === new Date().getFullYear());
  const viewing = viewingId && agents.find((a) => a.id === viewingId);

  const actionsFor = (a) => [
    { label: "View details", icon: Eye, onClick: () => setViewingId(a.id) },
    { label: "Change plan", icon: Repeat, onClick: () => setAction({ type: "changePlan", agent: a }) },
    { label: "Extend", icon: CalendarPlus, onClick: () => setAction({ type: "extend", agent: a }) },
    { label: a.sub.status === "pending" ? "Confirm payment" : "Activate", icon: Zap, onClick: () => setAction({ type: "activate", agent: a }), hidden: a.sub.isActive },
    { label: "Cancel", icon: XCircle, danger: true, onClick: () => setAction({ type: "cancel", agent: a }), hidden: !a.sub.isActive },
  ];

  const columns = [
    {
      key: "agent",
      header: "Agent",
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{a.name}</p>
          <p className="truncate text-xs text-gray-500">{a.email}</p>
        </div>
      ),
    },
    { key: "plan", header: "Plan", render: (a) => <span className="font-medium text-gray-800">{a.subscription.planName}</span> },
    { key: "amount", header: "Amount", render: (a) => <span className="font-semibold text-gray-900 tabular-nums">{formatCedis(a.subscription.price)}</span> },
    { key: "start", header: "Start", render: (a) => <span className="whitespace-nowrap text-gray-600">{formatDate(a.subscription.startDate)}</span> },
    {
      key: "expiry",
      header: "Expiry",
      render: (a) => (
        <span className="whitespace-nowrap text-gray-600">
          {formatDate(a.subscription.expiryDate)}
          {a.sub.isActive && <span className="block text-xs text-gray-400">{a.sub.daysRemaining} days left</span>}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (a) => <StatusBadge status={a.sub.statusLabel} tone={subTone[a.sub.status]} /> },
    { key: "payment", header: "Payment", render: (a) => <StatusBadge status={cap(a.subscription.paymentStatus)} tone={payTone[a.subscription.paymentStatus]} dot={false} /> },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", render: (a) => <ActionMenu actions={actionsFor(a)} label={`Actions for ${a.name}`} /> },
  ];

  return (
    <>
      <AdminPageTitle title="Subscriptions" description="Agent plans, renewals and payments." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStat index={0} icon={BadgeCheck} label="Active" value={count((a) => a.sub.isActive)} tone="green" />
        <AdminStat index={1} icon={Clock} label="Expiring in 7 days" value={count((a) => a.sub.expiringSoon)} tone="amber" />
        <AdminStat index={2} icon={Hourglass} label="Pending payment" value={count((a) => a.sub.status === "pending")} tone="slate" />
        <AdminStat index={3} icon={Wallet} label="Revenue this month" value={formatCedis(thisMonth.reduce((s, p) => s + p.amount, 0))} />
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          value={status}
          onChange={setStatus}
          tabs={[
            { id: "all", label: "All", count: subscribed.length },
            { id: "active", label: "Active", count: count((a) => a.sub.isActive) },
            { id: "expiring", label: "Expiring", count: count((a) => a.sub.status === "expiring") },
            { id: "expired", label: "Expired", count: count((a) => a.sub.status === "expired") },
            { id: "cancelled", label: "Cancelled", count: count((a) => a.sub.status === "cancelled") },
            { id: "pending", label: "Pending", count: count((a) => a.sub.status === "pending") },
          ]}
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Search agent or plan" className="lg:w-72" />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        minWidth={980}
        empty={<EmptyState icon={CreditCard} title="No subscriptions" description="Nothing matches this filter." />}
        mobileCard={(a) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => setViewingId(a.id)} className="min-w-0 text-left">
                <p className="truncate font-semibold text-gray-900">{a.name}</p>
                <p className="text-sm text-gray-500">{a.subscription.planName} · {formatCedis(a.subscription.price)}</p>
              </button>
              <ActionMenu actions={actionsFor(a)} label={`Actions for ${a.name}`} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <StatusBadge status={a.sub.statusLabel} tone={subTone[a.sub.status]} />
              <StatusBadge status={cap(a.subscription.paymentStatus)} tone={payTone[a.subscription.paymentStatus]} dot={false} />
              <span className="ml-auto text-xs text-gray-500">Expires {formatDate(a.subscription.expiryDate)}</span>
            </div>
          </div>
        )}
      />

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewingId(null)}
        title="Subscription details"
        description={viewing?.name}
        size="lg"
        footer={viewing && (
          <>
            <button onClick={() => setAction({ type: "extend", agent: viewing })} className="btn btn-light"><CalendarPlus className="h-4 w-4" />Extend</button>
            <button onClick={() => setAction({ type: "changePlan", agent: viewing })} className="btn btn-primary"><Repeat className="h-4 w-4" />Change plan</button>
          </>
        )}
      >
        {viewing && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={viewing.sub.statusLabel} tone={subTone[viewing.sub.status]} />
              <StatusBadge status={`Payment ${viewing.subscription.paymentStatus}`} tone={payTone[viewing.subscription.paymentStatus]} dot={false} />
            </div>
            <dl className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-3">
              {[
                ["Plan", viewing.subscription.planName],
                ["Amount", formatCedis(viewing.subscription.price)],
                ["Method", viewing.subscription.paymentMethod || "—"],
                ["Start", formatDate(viewing.subscription.startDate)],
                ["Expiry", formatDate(viewing.subscription.expiryDate)],
                ["Reference", viewing.subscription.reference],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="truncate font-semibold text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-900">Payment history</p>
              <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                {payments.filter((p) => p.userId === viewing.id).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span>
                      <span className="block font-medium text-gray-900">{getPlan(p.planId)?.name || p.planId} · {formatCedis(p.amount)}</span>
                      <span className="text-xs text-gray-500">{formatDate(p.createdAt)} · {p.method}</span>
                    </span>
                    <StatusBadge status={cap(p.status)} tone={payTone[p.status]} dot={false} />
                  </li>
                ))}
                {payments.every((p) => p.userId !== viewing.id) && <li className="px-4 py-3 text-sm text-gray-500">No payments recorded.</li>}
              </ul>
            </div>
          </div>
        )}
      </Modal>

      <SubscriptionDialogs action={action} onClose={() => setAction(null)} />
    </>
  );
};

export default AdminSubscriptions;
