import { useState } from "react";
import { Link } from "react-router-dom";
import { Ban, CheckCircle2, Eye, Pencil, Trash2, Users } from "lucide-react";
import { useAdminData } from "../../hooks/useAdminData";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import EditUserModal from "../../components/admin/EditUserModal";
import DataTable from "../../components/ui/DataTable";
import FilterTabs from "../../components/ui/FilterTabs";
import SearchInput from "../../components/ui/SearchInput";
import StatusBadge from "../../components/ui/StatusBadge";
import ActionMenu from "../../components/ui/ActionMenu";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { formatDate, formatRelative } from "../../utils/date";
import { getInitials } from "../../utils/property";

const roleBadge = (role) => <StatusBadge status={role[0].toUpperCase() + role.slice(1)} tone={{ admin: "gray", agent: "brand", user: "sky" }[role]} dot={false} />;
const statusBadge = (status) => <StatusBadge status={status === "suspended" ? "Suspended" : "Active"} tone={status === "suspended" ? "red" : "green"} />;

const Avatar = ({ user }) => (
  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{getInitials(user.name)}</span>
);

const AdminUsers = () => {
  const { users, user: me, admin, savedCount, userInquiries, findProperty } = useAdminData();
  const run = useAsyncAction();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type: "suspend" | "activate" | "delete", user }

  const counts = {
    all: users.length,
    users: users.filter((u) => u.role === "user").length,
    agents: users.filter((u) => u.role === "agent").length,
    suspended: users.filter((u) => u.status === "suspended").length,
    active: users.filter((u) => u.status !== "suspended").length,
  };
  const q = query.trim().toLowerCase();
  const rows = users
    .filter((u) =>
      filter === "users" ? u.role === "user" : filter === "agents" ? u.role === "agent" : filter === "suspended" ? u.status === "suspended" : filter === "active" ? u.status !== "suspended" : true
    )
    .filter((u) => !q || `${u.name} ${u.email} ${u.phone}`.toLowerCase().includes(q))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const viewed = viewing && users.find((u) => u.id === viewing);
  const protectedAccount = (u) => u.role === "admin" || u.id === me.id;

  const actionsFor = (u) => [
    { label: "View details", icon: Eye, onClick: () => setViewing(u.id) },
    { label: "Edit", icon: Pencil, onClick: () => setEditing(u) },
    u.status === "suspended"
      ? { label: "Activate", icon: CheckCircle2, onClick: () => setConfirm({ type: "activate", user: u }) }
      : { label: "Suspend", icon: Ban, onClick: () => setConfirm({ type: "suspend", user: u }), hidden: protectedAccount(u) },
    {
      label: "Delete",
      icon: Trash2,
      danger: true,
      onClick: () => setConfirm({ type: "delete", user: u }),
      hidden: protectedAccount(u),
      disabled: u.role === "agent",
      disabledReason: "Agents can't be deleted. Cancel their subscription or suspend them instead.",
    },
  ];

  const runConfirm = async () => {
    const { type, user: u } = confirm;
    setConfirm(null);
    if (type === "delete") {
      const { ok } = await run(admin.deleteUser(u.id), { success: "User deleted", description: u.name, type: "info" });
      if (ok && viewing === u.id) setViewing(null);
    } else {
      await run(admin.setStatus(u.id, type === "suspend" ? "suspended" : "active"), {
        success: type === "suspend" ? "User suspended" : "User activated",
        description: u.name,
        type: type === "suspend" ? "warning" : "success",
      });
    }
  };

  const columns = [
    {
      key: "user",
      header: "User",
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar user={u} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{u.name}{u.id === me.id && <span className="ml-1 text-xs font-normal text-gray-400">(you)</span>}</p>
            <p className="truncate text-xs text-gray-500">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: "phone", header: "Phone", render: (u) => <span className="whitespace-nowrap text-gray-600">{u.phone || "—"}</span> },
    { key: "role", header: "Role", render: (u) => roleBadge(u.role) },
    { key: "joined", header: "Registered", render: (u) => <span className="whitespace-nowrap text-gray-600">{formatDate(u.createdAt)}</span> },
    { key: "status", header: "Status", render: (u) => statusBadge(u.status) },
    { key: "saved", header: "Saved", align: "right", render: (u) => <span className="tabular-nums">{savedCount(u)}</span> },
    { key: "inq", header: "Inquiries", align: "right", render: (u) => <span className="tabular-nums">{userInquiries(u).length}</span> },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", render: (u) => <ActionMenu actions={actionsFor(u)} label={`Actions for ${u.name}`} /> },
  ];

  return (
    <>
      <AdminPageTitle title="Users" description="Everyone registered on HomeBase." />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: "all", label: "All", count: counts.all },
            { id: "users", label: "Users", count: counts.users },
            { id: "agents", label: "Agents", count: counts.agents },
            { id: "active", label: "Active", count: counts.active },
            { id: "suspended", label: "Suspended", count: counts.suspended },
          ]}
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, email or phone" className="lg:w-80" />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        minWidth={900}
        empty={<EmptyState icon={Users} title="No users found" description="Try another filter or search term." />}
        mobileCard={(u) => (
          <div>
            <div className="flex items-start gap-3">
              <Avatar user={u} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-gray-900">{u.name}</p>
                <p className="truncate text-sm text-gray-500">{u.email}</p>
                <div className="mt-2 flex flex-wrap gap-2">{roleBadge(u.role)}{statusBadge(u.status)}</div>
              </div>
              <ActionMenu actions={actionsFor(u)} label={`Actions for ${u.name}`} />
            </div>
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-gray-500">
              Joined {formatDate(u.createdAt)} · {savedCount(u)} saved · {userInquiries(u).length} inquiries
            </p>
          </div>
        )}
      />

      {/* Details */}
      <Modal open={Boolean(viewed)} onClose={() => setViewing(null)} title="User details" size="lg"
        footer={viewed && (
          <>
            {viewed.role === "agent" && <Link to={`/admin/agents?open=${viewed.id}`} className="btn btn-light">Agent profile</Link>}
            <button onClick={() => setEditing(viewed)} className="btn btn-primary"><Pencil className="h-4 w-4" />Edit user</button>
          </>
        )}
      >
        {viewed && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500 text-lg font-bold text-white">{getInitials(viewed.name)}</span>
              <div className="min-w-0">
                <p className="text-lg font-bold text-gray-900">{viewed.name}</p>
                <div className="mt-1 flex flex-wrap gap-2">{roleBadge(viewed.role)}{statusBadge(viewed.status)}</div>
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-4 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              {[
                ["Email", viewed.email],
                ["Phone", viewed.phone || "—"],
                ["Registered", formatDate(viewed.createdAt)],
                ["Saved properties", savedCount(viewed)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-semibold break-all text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-900">Inquiries sent ({userInquiries(viewed).length})</p>
              {userInquiries(viewed).length === 0 ? (
                <p className="text-sm text-gray-500">No inquiries yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
                  {userInquiries(viewed).map((inq) => (
                    <li key={inq.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-gray-900">{findProperty(inq.propertyId)?.title || "Removed property"}</span>
                        <span className="text-xs text-gray-500">{formatRelative(inq.createdAt)}</span>
                      </span>
                      <StatusBadge status={inq.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        tone={confirm?.type === "activate" ? "primary" : "danger"}
        title={{ suspend: "Suspend user?", activate: "Activate user?", delete: "Delete user?" }[confirm?.type]}
        confirmLabel={{ suspend: "Suspend user", activate: "Activate user", delete: "Delete user" }[confirm?.type]}
        description={
          confirm &&
          {
            suspend: `${confirm.user.name} will be signed out and won't be able to sign in until reactivated.${confirm.user.role === "agent" ? " Their listings will be hidden from the public." : ""}`,
            activate: `${confirm.user.name} will be able to sign in again.`,
            delete: `${confirm.user.name}'s account will be permanently removed. This can't be undone.`,
          }[confirm.type]
        }
      />
    </>
  );
};

export default AdminUsers;
