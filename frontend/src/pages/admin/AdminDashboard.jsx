import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Clock,
  CreditCard,
  FileClock,
  Inbox,
  MessageSquare,
  Radio,
  UserCheck,
  UserCog,
  UserX,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAdminData, trend } from "../../hooks/useAdminData";
import { adminApi } from "../../frontApi";
import AdminStat from "../../components/admin/AdminStat";
import StatusBadge from "../../components/ui/StatusBadge";
import { BarChart, ProportionBar } from "../../components/ui/Charts";
import { formatRelative, isWithinDays } from "../../utils/date";
import { formatPrice } from "../../utils/property";
import { formatCedis, monthlySeries } from "../../utils/reports";

const QuickAction = ({ icon: Icon, count, label, to, tone, index }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
    <Link to={to} className={`group flex h-full items-center gap-4 rounded-2xl p-4 text-white transition hover:-translate-y-0.5 hover:shadow-xl ${tone}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xl font-extrabold tabular-nums">{count}</span>
        <span className="block text-sm leading-snug text-white/80">{label}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
    </Link>
  </motion.div>
);

const AdminDashboard = () => {
  const { users, agents, listings, inquiries, payments, pendingListings, newInquiries, ownerOf, isPubliclyVisible, user } = useAdminData();

  // Headline numbers come from the dashboard endpoint; local data fills in while it loads
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    adminApi.getAdminDashboard().then(setSummary).catch(() => {});
  }, [users, listings, inquiries]);

  const customers = users.filter((u) => u.role !== "admin");
  const activeAgents = agents.filter((a) => a.sub.isActive && a.status !== "suspended");
  const expiredAgents = agents.filter((a) => a.sub.isExpired);
  const expiring = agents.filter((a) => a.sub.expiringSoon);
  const newAgents = agents.filter((a) => isWithinDays(a.createdAt, 30));
  const paid = payments.filter((p) => p.status === "paid");
  const revenue = paid.reduce((sum, p) => sum + p.amount, 0);

  const stats = [
    { icon: Users, label: "Total users", value: summary?.totalUsers ?? customers.length, change: trend(customers).change, to: "/admin/users" },
    { icon: UserCog, label: "Total agents", value: summary?.totalAgents ?? agents.length, change: trend(agents).change, to: "/admin/agents" },
    { icon: UserCheck, label: "Active agents", value: summary?.activeAgents ?? activeAgents.length, to: "/admin/agents?status=active", tone: "green" },
    { icon: UserX, label: "Expired agents", value: summary?.expiredAgents ?? expiredAgents.length, to: "/admin/agents?status=expired", tone: "red" },
    { icon: Building2, label: "Total properties", value: summary?.totalProperties ?? listings.length, change: trend(listings, (p) => p.listing.createdAt).change, to: "/admin/properties" },
    { icon: Radio, label: "Active properties", value: listings.filter(isPubliclyVisible).length, to: "/admin/properties?status=published", tone: "green" },
    { icon: FileClock, label: "Pending properties", value: summary?.pendingProperties ?? pendingListings.length, to: "/admin/properties?status=pending", tone: "amber" },
    { icon: MessageSquare, label: "Total inquiries", value: summary?.totalInquiries ?? inquiries.length, change: trend(inquiries).change, to: "/admin/inquiries" },
    { icon: BadgeCheck, label: "Active subscriptions", value: summary?.activeSubscriptions ?? agents.filter((a) => a.sub.isActive).length, to: "/admin/subscriptions?status=active" },
    { icon: Wallet, label: "Subscription revenue", value: formatCedis(summary?.revenue ?? revenue), change: trend(paid, (p) => p.createdAt, (p) => p.amount).change, to: "/admin/reports" },
  ];

  const revenueSeries = monthlySeries({ revenue: { items: paid, date: (p) => p.createdAt, value: (p) => p.amount } });
  const recentUsers = [...customers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">Welcome back, {user.firstName}</h1>
        <p className="mt-1 text-gray-500">Here's what needs your attention across HomeBase today.</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickAction index={0} icon={FileClock} count={pendingListings.length} label="Pending properties" to="/admin/properties?status=pending" tone="bg-linear-to-br from-brand-500 to-brand-700" />
        <QuickAction index={1} icon={UserCog} count={newAgents.length} label="New agents this month" to="/admin/agents?filter=new" tone="bg-linear-to-br from-gray-800 to-gray-950" />
        <QuickAction index={2} icon={Clock} count={expiring.length} label="Expiring soon" to="/admin/subscriptions?status=expiring" tone="bg-linear-to-br from-amber-500 to-amber-700" />
        <QuickAction index={3} icon={Inbox} count={newInquiries.length} label="New inquiries" to="/admin/inquiries?status=New" tone="bg-linear-to-br from-slate-600 to-slate-800" />
      </div>

      {/* Overview */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat, index) => (
          <AdminStat key={stat.label} index={index} {...stat} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900">Subscription revenue</h2>
              <p className="text-sm text-gray-500">Paid subscriptions, last 6 months</p>
            </div>
            <Link to="/admin/reports" className="text-sm font-semibold text-brand-600 hover:text-brand-800">Reports</Link>
          </div>
          <BarChart title="Subscription revenue by month" data={revenueSeries} series={[{ key: "revenue", label: "Revenue" }]} format={formatCedis} />
        </section>

        <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="font-bold text-gray-900">Agent subscriptions</h2>
          <p className="mb-5 text-sm text-gray-500">Current status of every agent plan</p>
          <ProportionBar
            segments={[
              { label: "Active", value: agents.filter((a) => a.sub.status === "active").length, className: "bg-emerald-500" },
              { label: "Expiring", value: expiring.length, className: "bg-amber-400" },
              { label: "Expired", value: expiredAgents.length, className: "bg-red-500" },
              { label: "Other", value: agents.filter((a) => ["cancelled", "pending", "none"].includes(a.sub.status)).length, className: "bg-slate-400" },
            ]}
          />
          <Link to="/admin/subscriptions" className="btn btn-light mt-6 w-full">
            <CreditCard className="h-4 w-4" />
            Manage subscriptions
          </Link>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Awaiting review</h2>
            <Link to="/admin/properties?status=pending" className="text-sm font-semibold text-brand-600 hover:text-brand-800">Review all</Link>
          </div>
          {pendingListings.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 py-10 text-center text-sm text-gray-500">No properties waiting for approval.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pendingListings.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Link to={`/admin/properties?status=pending&open=${p.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-slate-50">
                    <img src={p.media.images[0]} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-gray-900">{p.title}</span>
                      <span className="block truncate text-sm text-gray-500">{ownerOf(p).name} · {formatPrice(p)}</span>
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">{formatRelative(p.listing.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Recent registrations</h2>
            <Link to="/admin/users" className="text-sm font-semibold text-brand-600 hover:text-brand-800">All users</Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {recentUsers.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{u.firstName[0]}{u.lastName[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-gray-900">{u.name}</span>
                  <span className="block truncate text-sm text-gray-500">{u.email}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={u.role === "agent" ? "Agent" : "User"} tone={u.role === "agent" ? "brand" : "gray"} dot={false} />
                  <span className="text-xs text-gray-400">{formatRelative(u.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
};

export default AdminDashboard;
