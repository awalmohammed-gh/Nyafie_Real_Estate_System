import { useState } from "react";
import { Link } from "react-router-dom";
import { Ban, Building, CheckCircle2, Eye, HandCoins, Heart, Inbox, KeyRound, Mail, Pencil, Phone, Trash2, Users } from "lucide-react";
import { useAdminData } from "../../hooks/useAdminData";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { useTransactions } from "../../context/useTransactions";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import EditUserModal from "../../components/admin/EditUserModal";
import DataTable from "../../components/ui/DataTable";
import FilterTabs from "../../components/ui/FilterTabs";
import SearchInput from "../../components/ui/SearchInput";
import StatusBadge from "../../components/ui/StatusBadge";
import ActionMenu from "../../components/ui/ActionMenu";
import SidePanel from "../../components/ui/SidePanel";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { formatDate, formatRelative, isWithinDays } from "../../utils/date";
import { getInitials } from "../../utils/property";
import { formatCedis } from "../../utils/reports";

const statusBadge = (status) => <StatusBadge status={status === "suspended" ? "Suspended" : "Active"} tone={status === "suspended" ? "red" : "green"} />;

const Avatar = ({ user, size = "h-10 w-10 text-sm" }) => (
  <span className={`grid shrink-0 place-items-center rounded-full bg-slate-100 font-bold text-slate-600 ${size}`}>{getInitials(user.name)}</span>
);

/**
 * Customers: the people who registered to browse, rent and buy. Admin and agent accounts
 * have their own roles and pages (Settings > Admin Account, Agents) and never appear here.
 */
const AdminUsers = () => {
  const { users, admin, savedCount, userInquiries, findProperty } = useAdminData();
  const { offers, rentals, sales } = useTransactions();
  const run = useAsyncAction();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type: "suspend" | "activate" | "delete", user }

  const customers = users.filter((u) => u.role === "user");
  const activityOf = (u) => ({
    inquiries: userInquiries(u),
    offers: offers.filter((o) => o.customer?.id === u.id),
    rentals: rentals.filter((r) => r.customer?.id === u.id),
    purchases: sales.filter((s) => s.customer?.id === u.id),
  });

  const counts = {
    all: customers.length,
    active: customers.filter((u) => u.status !== "suspended").length,
    suspended: customers.filter((u) => u.status === "suspended").length,
    recent: customers.filter((u) => isWithinDays(u.createdAt, 30)).length,
  };
  const q = query.trim().toLowerCase();
  const rows = customers
    .filter((u) => (filter === "suspended" ? u.status === "suspended" : filter === "active" ? u.status !== "suspended" : filter === "recent" ? isWithinDays(u.createdAt, 30) : true))
    .filter((u) => !q || `${u.name} ${u.email} ${u.phone}`.toLowerCase().includes(q))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const viewed = viewing && customers.find((u) => u.id === viewing);
  const viewedActivity = viewed && activityOf(viewed);

  const actionsFor = (u) => [
    { label: "View customer", icon: Eye, onClick: () => setViewing(u.id) },
    { label: "Edit details", icon: Pencil, onClick: () => setEditing(u) },
    u.status === "suspended"
      ? { label: "Activate", icon: CheckCircle2, onClick: () => setConfirm({ type: "activate", user: u }) }
      : { label: "Suspend", icon: Ban, onClick: () => setConfirm({ type: "suspend", user: u }) },
    { label: "Delete", icon: Trash2, danger: true, onClick: () => setConfirm({ type: "delete", user: u }) },
  ];

  const runConfirm = async () => {
    const { type, user: u } = confirm;
    setConfirm(null);
    if (type === "delete") {
      const { ok } = await run(admin.deleteUser(u.id), { success: "Customer deleted", description: u.name, type: "info" });
      if (ok && viewing === u.id) setViewing(null);
    } else {
      await run(admin.setStatus(u.id, type === "suspend" ? "suspended" : "active"), {
        success: type === "suspend" ? "Customer suspended" : "Customer activated",
        description: u.name,
        type: type === "suspend" ? "warning" : "success",
      });
    }
  };

  const activityCell = (u) => {
    const a = activityOf(u);
    return (
      <span className="flex items-center gap-3 text-xs text-gray-600">
        {[
          [Inbox, a.inquiries.length, "inquiries"],
          [HandCoins, a.offers.length, "offers"],
          [KeyRound, a.rentals.length + a.purchases.length, "rental and purchase requests"],
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
          </div>
        </div>
      ),
    },
    { key: "phone", header: "Phone", render: (u) => <span className="whitespace-nowrap text-gray-600">{u.phone || "—"}</span> },
    { key: "joined", header: "Joined", render: (u) => <span className="whitespace-nowrap text-gray-600">{formatDate(u.createdAt)}</span> },
    { key: "activity", header: "Inquiries · Offers · Requests", render: activityCell },
    { key: "saved", header: "Saved", align: "right", render: (u) => <span className="tabular-nums">{savedCount(u)}</span> },
    { key: "status", header: "Status", render: (u) => statusBadge(u.status) },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", render: (u) => <ActionMenu actions={actionsFor(u)} label={`Actions for ${u.name}`} /> },
  ];

  // Everything the customer has done, newest first, for the preview panel
  const timeline = viewedActivity
    ? [
        ...viewedActivity.offers.map((o) => ({ id: `o-${o.id}`, icon: HandCoins, label: `Offer of ${formatCedis(o.amount)}`, subject: o.property.title, status: o.status, date: o.createdAt })),
        ...viewedActivity.rentals.map((r) => ({ id: `r-${r.id}`, icon: KeyRound, label: `Rental request · ${formatCedis(r.amount)}`, subject: r.property.title, status: r.status, date: r.createdAt })),
        ...viewedActivity.purchases.map((s) => ({ id: `s-${s.id}`, icon: Building, label: "Purchase request", subject: s.property.title, status: s.status, date: s.createdAt })),
        ...viewedActivity.inquiries.map((i) => ({ id: `i-${i.id}`, icon: Inbox, label: "Inquiry", subject: findProperty(i.propertyId)?.title || "Removed property", status: i.status, date: i.createdAt })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date))
    : [];

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
          ]}
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, email or phone" className="lg:w-80" />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        minWidth={900}
        onRowClick={(u) => setViewing(u.id)}
        empty={
          customers.length === 0 ? (
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
      <SidePanel
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
                <div className="flex flex-wrap items-center gap-2">{statusBadge(viewed.status)}<StatusBadge status="Customer" tone="sky" dot={false} /></div>
                <a href={`mailto:${viewed.email}`} className="flex items-center gap-1.5 truncate text-sm text-gray-600 hover:text-brand-700"><Mail className="h-3.5 w-3.5" />{viewed.email}</a>
                {viewed.phone && <a href={`tel:${viewed.phone.replace(/\s+/g, "")}`} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-700"><Phone className="h-3.5 w-3.5" />{viewed.phone}</a>}
              </div>
            </div>

            <dl className="grid grid-cols-2 divide-gray-100 overflow-hidden rounded-lg border border-gray-200 sm:grid-cols-4 sm:divide-x">
              {[
                ["Inquiries", viewedActivity.inquiries.length, Inbox],
                ["Offers", viewedActivity.offers.length, HandCoins],
                ["Requests", viewedActivity.rentals.length + viewedActivity.purchases.length, KeyRound],
                ["Saved", savedCount(viewed), Heart],
              ].map(([label, value, Icon]) => (
                <div key={label} className="p-3">
                  <dt className="flex items-center gap-1.5 text-xs text-gray-500"><Icon className="h-3.5 w-3.5" />{label}</dt>
                  <dd className="mt-0.5 text-lg font-semibold text-gray-900 tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Recent activity</h3>
              {timeline.length === 0 ? (
                <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">No inquiries, offers or requests yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {timeline.slice(0, 8).map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gray-50 text-gray-500"><t.icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900">{t.subject}</span>
                        <span className="block truncate text-xs text-gray-500">{t.label} · {formatRelative(t.date)}</span>
                      </span>
                      <StatusBadge status={t.status} />
                    </li>
                  ))}
                </ul>
              )}
              {timeline.length > 0 && (
                <p className="mt-3 text-xs text-gray-500">
                  Manage these from <Link to="/admin/offers" className="font-semibold text-brand-600">Offers</Link>, <Link to="/admin/rentals" className="font-semibold text-brand-600">Rentals</Link>, <Link to="/admin/sale-requests" className="font-semibold text-brand-600">Sales</Link> and <Link to="/admin/inquiries" className="font-semibold text-brand-600">Inquiries</Link>.
                </p>
              )}
            </div>

            <button onClick={() => setConfirm({ type: "delete", user: viewed })} className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700">
              <Trash2 className="h-4 w-4" />
              Delete customer account
            </button>
          </div>
        )}
      </SidePanel>

      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        tone={confirm?.type === "activate" ? "primary" : "danger"}
        title={{ suspend: "Suspend customer?", activate: "Activate customer?", delete: "Delete customer?" }[confirm?.type]}
        confirmLabel={{ suspend: "Suspend", activate: "Activate", delete: "Delete customer" }[confirm?.type]}
        description={
          confirm &&
          {
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
