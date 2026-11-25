import { useState } from "react";
import { Link } from "react-router-dom";
import { Ban, Building, CheckCircle2, Eye, HandCoins, Heart, Inbox, KeyRound, LogOut, Mail, Pencil, Phone, Trash2, Users } from "lucide-react";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { useDebounced, usePagedList } from "../../hooks/usePagedList";
import { useAuth } from "../../context/useAuth";
import { adminApi } from "../../frontApi";
import { ErrorState, TableSkeleton } from "../../components/dashboard/States";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import EditUserModal from "../../components/admin/EditUserModal";
import DataTable from "../../components/ui/DataTable";
import FilterTabs from "../../components/ui/FilterTabs";
import SearchInput from "../../components/ui/SearchInput";
import StatusBadge from "../../components/ui/StatusBadge";
import EmailStatus from "../../components/ui/EmailStatus";
import ActionMenu from "../../components/ui/ActionMenu";
import AdminRecordModal from "../../components/admin/AdminRecordModal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { formatDate, formatRelative } from "../../utils/date";
import { getInitials } from "../../utils/property";
import { formatCedis } from "../../utils/reports";
import { adminPath } from "../../utils/adminEntry";

const statusBadge = (status) => <StatusBadge status={status === "suspended" ? "Suspended" : "Active"} tone={status === "suspended" ? "red" : "green"} />;

const Avatar = ({ user, size = "h-10 w-10 text-sm" }) => (
  <span className={`grid shrink-0 place-items-center rounded-full bg-slate-100 font-bold text-slate-600 ${size}`}>{getInitials(user.name)}</span>
);

/**
 * Customers: the people who registered to browse, rent and buy. Admin and agent accounts
 * have their own roles and pages (Settings > Admin Account, Agents) and never appear here.
 */
const AdminUsers = () => {
  const { admin } = useAuth();
  const run = useAsyncAction();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type: "suspend" | "activate" | "delete", user }

  const search = useDebounced(query.trim());
  const list = usePagedList("admin-customers", { filter, search: search || undefined }, adminApi.getCustomersPage);
  const details = useApiQuery(viewing ? `admin-customer:${viewing}` : null, () => adminApi.getCustomer(viewing));
  const rows = list.data?.items || [];
  const counts = list.data?.counts || {};
  // The row shows at once; the customer's latest activity follows
  const viewed = viewing && (details.data || rows.find((u) => u.id === viewing) || null);
  const reload = () => {
    list.reload();
    details.reload();
  };

  const actionsFor = (u) => [
    { label: "View customer", icon: Eye, onClick: () => setViewing(u.id) },
    { label: "Edit details", icon: Pencil, onClick: () => setEditing(u) },
    { label: "Sign out everywhere", icon: LogOut, onClick: () => setConfirm({ type: "signOut", user: u }) },
    u.status === "suspended"
      ? { label: "Activate", icon: CheckCircle2, onClick: () => setConfirm({ type: "activate", user: u }) }
      : { label: "Suspend", icon: Ban, onClick: () => setConfirm({ type: "suspend", user: u }) },
    { label: "Delete", icon: Trash2, danger: true, onClick: () => setConfirm({ type: "delete", user: u }) },
  ];

  const runConfirm = async () => {
    const { type, user: u } = confirm;
    setConfirm(null);
    if (type === "signOut") await run(admin.signOutUser(u.id), { success: "Signed out everywhere", description: u.name, type: "info" });
    else if (type === "delete") {
      const { ok } = await run(admin.deleteUser(u.id), { success: "Customer deleted", description: u.name, type: "info" });
      if (ok && viewing === u.id) setViewing(null);
      if (ok) list.reload();
    } else {
      const { ok } = await run(admin.setStatus(u.id, type === "suspend" ? "suspended" : "active", "user"), {
        success: type === "suspend" ? "Customer suspended" : "Customer activated",
        description: u.name,
        type: type === "suspend" ? "warning" : "success",
      });
      if (ok) reload();
    }
  };

  const activityCell = (u) => {
    const a = u.activity;
    return (
      <span className="flex items-center gap-3 text-xs text-gray-600">
        {[
          [Inbox, a.inquiries, "inquiries"],
          [HandCoins, a.offers, "offers"],
          [KeyRound, a.rentals + a.purchases, "rental and purchase requests"],
        ].map(([Icon, n, label]) => (
          <span key={label} className={`inline-flex items-center gap-1 ${n ? "text-gray-800" : "text-gray-400"}`} title={`${n} ${label}`}>
            <Icon className="h-3.5 w-3.5" />
            <span className="tabular-nums">{n}</span>
          </span>
        ))}
      </span>
    );
  };

  const columns = [
    {
      key: "customer",
      header: "Customer",
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar user={u} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{u.name}</p>
            <p className="truncate text-xs text-gray-500">{u.email}</p>
            <EmailStatus verified={u.emailVerified} />
          </div>
        </div>
      ),
    },
    { key: "phone", header: "Phone", render: (u) => <span className="whitespace-nowrap text-gray-600">{u.phone || "—"}</span> },
    { key: "joined", header: "Joined", render: (u) => <span className="whitespace-nowrap text-gray-600">{formatDate(u.createdAt)}</span> },
    { key: "activity", header: "Inquiries · Offers · Requests", render: activityCell },
    { key: "saved", header: "Saved", align: "right", render: (u) => <span className="tabular-nums">{u.savedCount}</span> },
    { key: "status", header: "Status", render: (u) => statusBadge(u.status) },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", render: (u) => <ActionMenu actions={actionsFor(u)} label={`Actions for ${u.name}`} /> },
  ];

  // The customer's latest activity, newest first, for the preview panel
  const ENTRY = {
    offer: (e) => [HandCoins, `Offer of ${formatCedis(e.amount)}`],
    rental: (e) => [KeyRound, `Rental request · ${formatCedis(e.amount)}`],
    purchase: () => [Building, "Purchase request"],
    inquiry: () => [Inbox, "Inquiry"],
  };
  const timeline = (details.data?.recent || []).map((entry) => {
    const [icon, label] = ENTRY[entry.kind](entry);
    return { ...entry, icon, label };
  });

  if (!list.data) return (
    <>
      <AdminPageTitle title="Customers" description="People who registered to browse, rent and buy. Agents are managed on the Agents page." />
      {list.error ? <ErrorState title="Couldn't load customers" message={list.error} onRetry={list.reload} /> : <TableSkeleton />}
    </>
  );

  return (
    <>
      <AdminPageTitle title="Customers" description="People who registered to browse, rent and buy. Agents are managed on the Agents page." />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: "all", label: "All", count: counts.all },
            { id: "active", label: "Active", count: counts.active },
            { id: "recent", label: "Joined this month", count: counts.recent },
            { id: "suspended", label: "Suspended", count: counts.suspended },
            { id: "unverified", label: "Email not verified", count: counts.unverified },
          ]}
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, email or phone" className="lg:w-80" />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        paging={list.paging}
        minWidth={900}
        onRowClick={(u) => setViewing(u.id)}
        empty={
          counts.all === 0 ? (
            <EmptyState icon={Users} title="No customers yet" description="Registered customers will appear here." />
          ) : (
            <EmptyState icon={Users} title="No customers found" description="Try another filter or search term." />
          )
        }
        mobileCard={(u) => (
          <div>
            <div className="flex items-start gap-3">
              <Avatar user={u} />
              <button onClick={() => setViewing(u.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate font-semibold text-gray-900">{u.name}</p>
                <p className="truncate text-sm text-gray-500">{u.email}</p>
                <EmailStatus verified={u.emailVerified} />
              </button>
              <ActionMenu actions={actionsFor(u)} label={`Actions for ${u.name}`} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              {activityCell(u)}
              {statusBadge(u.status)}
            </div>
          </div>
        )}
      />

      {/* Customer preview */}
      <AdminRecordModal
        open={Boolean(viewed)}
        onClose={() => setViewing(null)}
        title={viewed?.name}
        description={viewed && `Customer since ${formatDate(viewed.createdAt)}`}
        footer={
          viewed && (
            <>
              {viewed.status === "suspended" ? (
                <button onClick={() => setConfirm({ type: "activate", user: viewed })} className="btn btn-light"><CheckCircle2 className="h-4 w-4" />Activate</button>
              ) : (
                <button onClick={() => setConfirm({ type: "suspend", user: viewed })} className="btn btn-light"><Ban className="h-4 w-4" />Suspend</button>
              )}
              <button onClick={() => setEditing(viewed)} className="btn btn-primary"><Pencil className="h-4 w-4" />Edit details</button>
            </>
          )
        }
      >
        {viewed && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar user={viewed} size="h-14 w-14 text-lg" />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">{statusBadge(viewed.status)}<StatusBadge status="Customer" tone="sky" dot={false} /><EmailStatus verified={viewed.emailVerified} /></div>
                <a href={`mailto:${viewed.email}`} className="flex items-center gap-1.5 truncate text-sm text-gray-600 hover:text-brand-700"><Mail className="h-3.5 w-3.5" />{viewed.email}</a>
                {viewed.phone && <a href={`tel:${viewed.phone.replace(/\s+/g, "")}`} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-700"><Phone className="h-3.5 w-3.5" />{viewed.phone}</a>}
              </div>
            </div>

            <dl className="grid grid-cols-2 divide-gray-100 overflow-hidden rounded-lg border border-gray-200 sm:grid-cols-4 sm:divide-x">
              {[
                ["Inquiries", viewed.activity.inquiries, Inbox],
                ["Offers", viewed.activity.offers, HandCoins],
                ["Requests", viewed.activity.rentals + viewed.activity.purchases, KeyRound],
                ["Saved", viewed.savedCount, Heart],
              ].map(([label, value, Icon]) => (
                <div key={label} className="p-3">
                  <dt className="flex items-center gap-1.5 text-xs text-gray-500"><Icon className="h-3.5 w-3.5" />{label}</dt>
                  <dd className="mt-0.5 text-lg font-semibold text-gray-900 tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Recent activity</h3>
              {!details.data ? (
                <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500" role="status">{details.error || "Loading activity..."}</p>
              ) : timeline.length === 0 ? (
                <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">No inquiries, offers or requests yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {timeline.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gray-50 text-gray-500"><t.icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900">{t.subject}</span>
                        <span className="block truncate text-xs text-gray-500">{t.label} · {formatRelative(t.createdAt)}</span>
                      </span>
                      <StatusBadge status={t.status} />
                    </li>
                  ))}
                </ul>
              )}
              {timeline.length > 0 && (
                <p className="mt-3 text-xs text-gray-500">
                  Manage these from <Link to={adminPath("/offers")} className="font-semibold text-brand-600">Offers</Link>, <Link to={adminPath("/rentals")} className="font-semibold text-brand-600">Rentals</Link>, <Link to={adminPath("/sale-requests")} className="font-semibold text-brand-600">Sales</Link> and <Link to={adminPath("/inquiries")} className="font-semibold text-brand-600">Inquiries</Link>.
                </p>
              )}
            </div>

            <button onClick={() => setConfirm({ type: "delete", user: viewed })} className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700">
              <Trash2 className="h-4 w-4" />
              Delete customer account
            </button>
          </div>
        )}
      </AdminRecordModal>

      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} onSaved={reload} />}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        tone={confirm?.type === "activate" ? "primary" : "danger"}
        title={{ signOut: "Sign out everywhere?", suspend: "Suspend customer?", activate: "Activate customer?", delete: "Delete customer?" }[confirm?.type]}
        confirmLabel={{ signOut: "Sign out everywhere", suspend: "Suspend", activate: "Activate", delete: "Delete customer" }[confirm?.type]}
        description={
          confirm &&
          {
            signOut: `${confirm.user.name} will be signed out of every device. They can sign in again.`,
            suspend: `${confirm.user.name} will be signed out and won't be able to sign in until reactivated.`,
            activate: `${confirm.user.name} will be able to sign in again.`,
            delete: `${confirm.user.name}'s account and open requests will be permanently removed. Completed payments stay on record. This can't be undone.`,
          }[confirm.type]
        }
      />
    </>
  );
};

export default AdminUsers;
