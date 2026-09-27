import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Ban, Building2, CalendarPlus, CheckCircle2, Eye, Inbox, Pencil, Repeat, UserCog, XCircle, Zap } from "lucide-react";
import { useAdminData } from "../../hooks/useAdminData";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import EditUserModal from "../../components/admin/EditUserModal";
import SubscriptionDialogs from "../../components/admin/SubscriptionDialogs";
import DataTable from "../../components/ui/DataTable";
import FilterTabs from "../../components/ui/FilterTabs";
import SearchInput from "../../components/ui/SearchInput";
import StatusBadge from "../../components/ui/StatusBadge";
import ActionMenu from "../../components/ui/ActionMenu";
import SidePanel from "../../components/ui/SidePanel";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { formatDate, isWithinDays } from "../../utils/date";
import { formatPrice, getInitials, getListingStatus } from "../../utils/property";

const UsageBar = ({ used, limit }) => {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="w-24">
      <p className="text-xs font-semibold text-gray-700 tabular-nums">{used} / {limit ?? "—"}</p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const AdminAgents = () => {
  const { agents, plans, admin, isPubliclyVisible } = useAdminData();
  const run = useAsyncAction();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(params.get("status") || (params.get("filter") === "new" ? "new" : "all"));
  const [planFilter, setPlanFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [subAction, setSubAction] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const openId = params.get("open");
  const viewed = openId && agents.find((a) => a.id === openId);
  const setOpen = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set("open", id);
    else next.delete("open");
    setParams(next, { replace: true });
  };

  const matchStatus = (a) => {
    if (status === "all") return true;
    if (status === "suspended") return a.status === "suspended";
    if (status === "new") return isWithinDays(a.createdAt, 30);
    if (status === "active") return a.sub.isActive;
    return a.sub.status === status;
  };
  const q = query.trim().toLowerCase();
  const rows = agents
    .filter(matchStatus)
    .filter((a) => planFilter === "all" || a.subscription?.planId === planFilter)
    .filter((a) => !q || `${a.name} ${a.email} ${a.phone}`.toLowerCase().includes(q))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const count = (fn) => agents.filter(fn).length;

  const actionsFor = (a) => [
    { label: "View agent", icon: Eye, onClick: () => setOpen(a.id) },
    { label: "Edit agent", icon: Pencil, onClick: () => setEditing(a) },
    { label: "Change plan", icon: Repeat, onClick: () => setSubAction({ type: "changePlan", agent: a }) },
    { label: "Extend subscription", icon: CalendarPlus, onClick: () => setSubAction({ type: "extend", agent: a }), hidden: !a.subscription },
    { label: "Activate subscription", icon: Zap, onClick: () => setSubAction({ type: "activate", agent: a }), hidden: !a.subscription || a.sub.isActive },
    { label: "Cancel subscription", icon: XCircle, danger: true, onClick: () => setSubAction({ type: "cancel", agent: a }), hidden: !a.sub.isActive },
    { label: "View properties", icon: Building2, onClick: () => navigate(`/admin/properties?owner=${a.id}`) },
    { label: "View inquiries", icon: Inbox, onClick: () => navigate(`/admin/inquiries?agent=${a.id}`) },
    a.status === "suspended"
      ? { label: "Activate agent", icon: CheckCircle2, onClick: () => setConfirm({ type: "activate", agent: a }) }
      : { label: "Suspend agent", icon: Ban, danger: true, onClick: () => setConfirm({ type: "suspend", agent: a }) },
  ];

  const subBadge = (a) => <StatusBadge status={a.sub.statusLabel} tone={{ active: "green", expiring: "amber", expired: "red", cancelled: "gray", pending: "amber", none: "gray" }[a.sub.status]} />;

  const liveCount = (a) => a.properties.filter((p) => p.listing.state === "published" && isPubliclyVisible(p)).length;
  const newInquiries = (a) => a.inquiries.filter((i) => i.status === "New").length;

  const columns = [
    {
      key: "agent",
      header: "Agent",
      render: (a) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{getInitials(a.name)}</span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-gray-900">{a.name}</span>
            <span className="block truncate text-xs text-gray-500">{a.email}</span>
          </span>
        </div>
      ),
    },
    { key: "phone", header: "Phone", render: (a) => <span className="whitespace-nowrap text-gray-600">{a.phone || "—"}</span> },
    {
      key: "sub",
      header: "Plan",
      render: (a) => (
        <div>
          <p className="text-gray-800">{a.plan?.name || a.subscription?.planName || "No plan"}</p>
          <div className="mt-0.5">{subBadge(a)}</div>
        </div>
      ),
    },
    { key: "props", header: "Listings used", render: (a) => <UsageBar used={a.activeCount} limit={a.plan?.propertyLimit} /> },
    { key: "live", header: "Live", align: "right", render: (a) => <span className="tabular-nums">{liveCount(a)}</span> },
    {
      key: "inq",
      header: "New inquiries",
      align: "right",
      render: (a) => <span className={`tabular-nums ${newInquiries(a) ? "font-semibold text-amber-700" : "text-gray-500"}`}>{newInquiries(a)}</span>,
    },
    { key: "account", header: "Account", render: (a) => <StatusBadge status={a.status === "suspended" ? "Suspended" : "Active"} tone={a.status === "suspended" ? "red" : "green"} /> },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", render: (a) => <ActionMenu actions={actionsFor(a)} label={`Actions for ${a.name}`} /> },
  ];

  const runConfirm = async () => {
    const { type, agent } = confirm;
    setConfirm(null);
    await run(admin.setStatus(agent.id, type === "suspend" ? "suspended" : "active"), {
      success: type === "suspend" ? "Agent suspended" : "Agent activated",
      description: agent.name,
      type: type === "suspend" ? "warning" : "success",
    });
  };

  return (
    <>
      <AdminPageTitle title="Agents" description="Subscribed agents, their plans, usage and account status." />

      <div className="mb-5 flex flex-col gap-3">
        <FilterTabs
          value={status}
          onChange={setStatus}
          tabs={[
            { id: "all", label: "All", count: agents.length },
            { id: "active", label: "Active", count: count((a) => a.sub.isActive) },
            { id: "expiring", label: "Expiring", count: count((a) => a.sub.status === "expiring") },
            { id: "expired", label: "Expired", count: count((a) => a.sub.status === "expired") },
            { id: "pending", label: "Pending", count: count((a) => a.sub.status === "pending") },
            { id: "cancelled", label: "Cancelled", count: count((a) => a.sub.status === "cancelled") },
            { id: "suspended", label: "Suspended", count: count((a) => a.status === "suspended") },
            { id: "new", label: "New", count: count((a) => isWithinDays(a.createdAt, 30)) },
          ]}
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchInput value={query} onChange={setQuery} placeholder="Search agents" className="sm:w-80" />
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} aria-label="Filter by plan" className="field py-2 sm:w-48">
            <option value="all">All plans</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        minWidth={1000}
        onRowClick={(a) => setOpen(a.id)}
        empty={<EmptyState icon={UserCog} title="No agents found" description="Try a different filter." />}
        mobileCard={(a) => (
          <div>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700">{getInitials(a.name)}</span>
              <button onClick={() => setOpen(a.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate font-semibold text-gray-900">{a.name}</p>
                <p className="truncate text-sm text-gray-500">{a.plan?.name || "No plan"} · {a.email}</p>
              </button>
              <ActionMenu actions={actionsFor(a)} label={`Actions for ${a.name}`} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap gap-2">
                {subBadge(a)}
                {a.status === "suspended" && <StatusBadge status="Suspended" />}
              </div>
              <UsageBar used={a.activeCount} limit={a.plan?.propertyLimit} />
            </div>
          </div>
        )}
      />

      {/* Agent details */}
      <SidePanel
        open={Boolean(viewed)}
        onClose={() => setOpen(null)}
        title={viewed?.name}
        description={viewed && `Agent since ${formatDate(viewed.createdAt)}`}
        footer={
          viewed && (
            <>
              <button onClick={() => setSubAction({ type: "changePlan", agent: viewed })} className="btn btn-light flex-1"><Repeat className="h-4 w-4" />Change plan</button>
              {viewed.subscription && <button onClick={() => setSubAction({ type: "extend", agent: viewed })} className="btn btn-light flex-1"><CalendarPlus className="h-4 w-4" />Extend</button>}
              <button onClick={() => setEditing(viewed)} className="btn btn-primary flex-1"><Pencil className="h-4 w-4" />Edit</button>
            </>
          )
        }
      >
        {viewed && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {subBadge(viewed)}
              <StatusBadge status={viewed.status === "suspended" ? "Suspended" : "Account active"} tone={viewed.status === "suspended" ? "red" : "green"} />
            </div>

            <div className="grid grid-cols-3 divide-x divide-gray-100 rounded-lg border border-gray-200 text-center">
              {[
                ["Properties", viewed.properties.length],
                ["Live", liveCount(viewed)],
                ["New inquiries", newInquiries(viewed)],
              ].map(([label, value]) => (
                <div key={label} className="px-2 py-3">
                  <p className="text-lg font-semibold text-gray-900 tabular-nums">{value}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              ))}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-gray-200 p-4 text-sm">
              {[
                ["Email", viewed.email],
                ["Phone", viewed.phone],
                ["Plan", viewed.plan?.name || "—"],
                ["Paid", viewed.subscription ? `₵${viewed.subscription.price.toLocaleString()} · ${viewed.subscription.paymentStatus}` : "—"],
                ["Started", viewed.subscription ? formatDate(viewed.subscription.startDate) : "—"],
                ["Expires", viewed.subscription ? formatDate(viewed.subscription.expiryDate) : "—"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="truncate font-semibold text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>

            {viewed.plan && (
              <div>
                <p className="mb-3 text-sm font-semibold text-gray-900">Plan usage</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ["Properties", `${viewed.activeCount}/${viewed.plan.propertyLimit}`],
                    ["Photos each", viewed.plan.imageLimit],
                    ["Featured", `${viewed.properties.filter((p) => p.meta?.isFeatured).length}/${viewed.plan.featuredLimit}`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-gray-200 p-3">
                      <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
                      <p className="text-xs text-gray-500">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Properties ({viewed.properties.length})</p>
                <Link to={`/admin/properties?owner=${viewed.id}`} className="text-sm font-semibold text-brand-600">Manage</Link>
              </div>
              {viewed.properties.length === 0 ? (
                <p className="text-sm text-gray-500">No properties yet.</p>
              ) : (
                <ul className="space-y-2">
                  {viewed.properties.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-2">
                      <img src={p.media.images[0]} alt="" className="h-11 w-14 shrink-0 rounded-lg object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-gray-900">{p.title}</span>
                        <span className="text-xs text-gray-500">{formatPrice(p)}</span>
                      </span>
                      <StatusBadge status={getListingStatus(p, isPubliclyVisible(p) || p.listing.state !== "published")} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-700"><span className="font-semibold">{viewed.inquiries.length}</span> inquiries received</p>
              <Link to={`/admin/inquiries?agent=${viewed.id}`} className="text-sm font-semibold text-brand-600">View inquiries</Link>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-5">
              {viewed.sub.isActive ? (
                <button onClick={() => setSubAction({ type: "cancel", agent: viewed })} className="btn btn-light text-red-600"><XCircle className="h-4 w-4" />Cancel subscription</button>
              ) : viewed.subscription && (
                <button onClick={() => setSubAction({ type: "activate", agent: viewed })} className="btn btn-light"><Zap className="h-4 w-4" />Activate subscription</button>
              )}
              {viewed.status === "suspended" ? (
                <button onClick={() => setConfirm({ type: "activate", agent: viewed })} className="btn btn-light"><CheckCircle2 className="h-4 w-4" />Activate agent</button>
              ) : (
                <button onClick={() => setConfirm({ type: "suspend", agent: viewed })} className="btn btn-light text-red-600"><Ban className="h-4 w-4" />Suspend agent</button>
              )}
            </div>
          </div>
        )}
      </SidePanel>

      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
      <SubscriptionDialogs action={subAction} onClose={() => setSubAction(null)} />

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        tone={confirm?.type === "activate" ? "primary" : "danger"}
        title={confirm?.type === "suspend" ? "Suspend agent?" : "Activate agent?"}
        confirmLabel={confirm?.type === "suspend" ? "Suspend Agent" : "Activate Agent"}
        description={
          confirm?.type === "suspend"
            ? `This will prevent ${confirm.agent.name} from signing in, publishing or managing properties. Their listings will be hidden from the public.`
            : `${confirm?.agent.name} will regain access based on their subscription.`
        }
      />
    </>
  );
};

export default AdminAgents;
