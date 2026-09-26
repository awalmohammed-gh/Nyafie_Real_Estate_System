import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { agentApi } from "../../frontApi";
import { motion } from "motion/react";
import { ArrowRight, Building2, CalendarClock, Eye, Inbox, MessageSquare, PlusSquare, Radio, Trophy } from "lucide-react";
import { useAgent } from "../../hooks/useAgent";
import { useRealEstate } from "../../context/useRealEstate";
import PageTitle from "../../components/agent/PageTitle";
import StatusBadge from "../../components/ui/StatusBadge";
import EmptyState from "../../components/ui/EmptyState";
import LockedFeature from "../../components/ui/LockedFeature";
import { BarChart, BarList } from "../../components/ui/Charts";
import { formatPrice, getListingStatus } from "../../utils/property";
import { formatDate, formatRelative } from "../../utils/date";
import { lockCopy } from "../../utils/permissions";

const StatCard = ({ icon: Icon, label, value, hint, index }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.05, duration: 0.3 }}
    className="rounded-3xl bg-white p-5 ring-1 ring-gray-200 sm:p-6"
  >
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-500">
        <Icon className="h-5 w-5" />
      </span>
    </div>
    <p className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">{value}</p>
    {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
  </motion.div>
);

const Panel = ({ title, description, children, className = "" }) => (
  <section className={`rounded-3xl bg-white p-6 ring-1 ring-gray-200 ${className}`}>
    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
    {description && <p className="mb-5 text-sm text-gray-500">{description}</p>}
    {children}
  </section>
);

// Demo-only weekly view estimate: spreads a listing's views over 8 weeks deterministically
const weeklyViews = (properties) => {
  const weeks = Array.from({ length: 8 }, (_, i) => ({ label: `W${i + 1}`, values: { views: 0 } }));
  properties.forEach((p) => {
    const seed = [...p.id].reduce((s, c) => s + c.charCodeAt(0), 0);
    const weights = weeks.map((_, i) => (0.6 + ((seed + i * 37) % 100) / 125) * (1 + i * 0.06));
    const total = weights.reduce((s, w) => s + w, 0);
    const recent = Math.round((p.meta?.views || 0) * 0.35);
    weights.forEach((w, i) => (weeks[i].values.views += Math.round((recent * w) / total)));
  });
  return weeks;
};

const statusTone = { active: "green", expiring: "amber", expired: "red", cancelled: "gray", pending: "amber" };

const Dashboard = () => {
  const { user, myProperties, myInquiries, permissions: perms } = useAgent();
  const { findProperty, isPubliclyVisible } = useRealEstate();
  const subscription = user.subscription;
  const state = perms.subscription;

  // Headline numbers from the dashboard endpoint (one request); local data fills in while it loads
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    agentApi.getAgentDashboard().then(setSummary).catch(() => {});
  }, [myProperties, myInquiries]);

  const liveListings = myProperties.filter(isPubliclyVisible);
  const totalViews = myProperties.reduce((sum, p) => sum + (p.meta?.views || 0), 0);
  const newInquiries = myInquiries.filter((inq) => inq.status === "New").length;
  const pendingCount = myProperties.filter((p) => p.listing.state === "pending").length;
  const draftCount = myProperties.filter((p) => p.listing.state === "draft").length;

  const recentProperties = [...myProperties].sort((a, b) => new Date(b.listing.updatedAt) - new Date(a.listing.updatedAt)).slice(0, 4);
  const recentInquiries = [...myInquiries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const usagePercent = perms.propertyLimit ? Math.min(100, Math.round((perms.activeCount / perms.propertyLimit) * 100)) : 0;

  // Per-listing performance (views -> inquiries)
  const performance = myProperties
    .filter((p) => p.listing.state === "published")
    .map((p) => {
      const inquiries = myInquiries.filter((i) => i.propertyId === p.id).length;
      const views = p.meta?.views || 0;
      return { property: p, views, inquiries, conversion: views ? (inquiries / views) * 100 : 0 };
    })
    .sort((a, b) => b.views - a.views);
  const best = [...performance].sort((a, b) => b.conversion - a.conversion)[0];

  const stats = [
    { icon: Building2, label: "Total properties", value: summary?.totalProperties ?? myProperties.length, hint: `${pendingCount} pending review · ${draftCount} drafts` },
    { icon: Radio, label: "Active listings", value: summary?.activeProperties ?? liveListings.length, hint: perms.isActive ? "Visible to the public" : "Hidden until you renew" },
    { icon: Eye, label: "Property views", value: (summary?.propertyViews ?? totalViews).toLocaleString(), hint: "Across all listings" },
    { icon: Inbox, label: "New inquiries", value: summary?.newInquiries ?? newInquiries, hint: `${myInquiries.length} total` },
  ];

  const renewTo = subscription ? `/agent/checkout?plan=${subscription.planId}` : "/agent/plans";
  const locked = (feature) => {
    const copy = lockCopy(perms, feature);
    return <LockedFeature compact title={copy.title} description={copy.description} cta={copy.cta} to={perms.isActive ? "/agent/plans#plans" : renewTo} />;
  };

  return (
    <>
      <PageTitle
        title={`Good to see you, ${user.firstName}`}
        description="Here's how your listings are doing."
        action={
          perms.canCreateDraft && (
            <Link to="/agent/properties/add" className="btn btn-primary sm:hidden">
              <PlusSquare className="h-4 w-4" />
              Add Property
            </Link>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {stats.map((stat, index) => <StatCard key={stat.label} {...stat} index={index} />)}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Subscription */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="relative overflow-hidden rounded-3xl bg-gray-900 p-6 text-white xl:self-start"
        >
          <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-brand-500/30 blur-2xl" />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-400">Subscription</p>
              <StatusBadge status={state.statusLabel} tone={statusTone[state.status]} />
            </div>
            <p className="mt-2 text-2xl font-extrabold">{perms.plan?.name || subscription?.planName} plan</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-gray-300">
              <CalendarClock className="h-4 w-4" />
              {state.isActive ? `Expires ${formatDate(subscription.expiryDate)} · ${state.daysRemaining} days left` : `${state.statusLabel} · ${formatDate(subscription.expiryDate)}`}
            </p>
            <div className="mt-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Properties</span>
                <span className="font-semibold">{perms.activeCount} / {perms.propertyLimit} used</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${usagePercent}%` }}
                  transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
                  className={`h-full rounded-full ${usagePercent >= 100 ? "bg-red-400" : usagePercent >= 80 ? "bg-amber-400" : "bg-brand-400"}`}
                />
              </div>
              {perms.limitReached && <p className="mt-2 text-xs text-red-300">Property limit reached. Upgrade to add more.</p>}
              {perms.nearLimit && <p className="mt-2 text-xs text-amber-300">You are close to your property limit.</p>}
            </div>
            <Link
              to={state.isActive ? "/agent/subscription" : renewTo}
              className={`btn mt-6 w-full ${state.isActive ? "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20" : "btn-primary"}`}
            >
              {state.isActive ? "Manage subscription" : "Renew Subscription"}
            </Link>
          </div>
        </motion.section>

        {/* Recent properties */}
        <section className="rounded-3xl bg-white p-6 ring-1 ring-gray-200 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Recent properties</h2>
            <Link to="/agent/properties" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-800">View all <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {recentProperties.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No properties yet"
              description="Add your first property to start receiving inquiries."
              action={perms.canCreateDraft && <Link to="/agent/properties/add" className="btn btn-primary">Add Property</Link>}
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentProperties.map((property) => (
                <li key={property.id} className="flex items-center gap-4 py-3">
                  <img src={property.media.images[0]} alt="" className="h-14 w-16 shrink-0 rounded-xl bg-gray-100 object-cover sm:w-20" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900">{property.title}</p>
                    <p className="truncate text-sm text-gray-500">{formatPrice(property)} · {property.location.name}</p>
                  </div>
                  <div className="hidden items-center gap-1 text-sm text-gray-500 sm:flex">
                    <Eye className="h-4 w-4" />
                    {(property.meta?.views || 0).toLocaleString()}
                  </div>
                  <StatusBadge status={getListingStatus(property, perms.isActive)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Analytics: each block is gated by the plan's analytics level */}
      <h2 className="mt-10 mb-4 text-xl font-extrabold tracking-tight text-gray-900">Analytics</h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Property views" description="Total views per published listing">
          {perms.canViewAnalytics ? (
            <BarList items={performance.slice(0, 6).map((row) => ({ label: row.property.title, value: row.views }))} emptyText="Publish a property to start collecting views." />
          ) : (
            locked()
          )}
        </Panel>

        <Panel title="Inquiry statistics" description="How your leads are progressing">
          {perms.canViewInquiryStats ? (
            <div className="grid grid-cols-2 gap-3">
              {["New", "Contacted", "In Progress", "Closed"].map((s) => (
                <div key={s} className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-2xl font-extrabold text-gray-900 tabular-nums">{myInquiries.filter((i) => i.status === s).length}</p>
                  <StatusBadge status={s} className="mt-2" />
                </div>
              ))}
            </div>
          ) : (
            locked("inquiryStats")
          )}
        </Panel>

        <Panel title="Property performance" description="Views, inquiries and conversion per listing" className="lg:col-span-2">
          {perms.canViewPerformance ? (
            performance.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No published listings yet.</p>
            ) : (
              <div className="-mx-6 overflow-x-auto px-6">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
                    <tr className="border-b border-gray-100">
                      <th className="py-2 pr-4">Property</th>
                      <th className="px-4 py-2 text-right">Views</th>
                      <th className="px-4 py-2 text-right">Inquiries</th>
                      <th className="py-2 pl-4 text-right">Conversion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {performance.map((row) => (
                      <tr key={row.property.id}>
                        <td className="max-w-60 truncate py-3 pr-4 font-medium text-gray-900">{row.property.title}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.views.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.inquiries}</td>
                        <td className="py-3 pl-4 text-right font-semibold tabular-nums">{row.conversion.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            locked("performance")
          )}
        </Panel>

        <Panel title="Advanced analytics" description="Listing performance trend over the last 8 weeks (estimated from demo data)" className="lg:col-span-2">
          {perms.canViewAdvancedAnalytics ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <BarChart title="Estimated weekly listing views" data={weeklyViews(performance.map((r) => r.property))} series={[{ key: "views", label: "Views" }]} />
              </div>
              <div className="space-y-3">
                {best && (
                  <div className="rounded-2xl bg-brand-50/70 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-brand-700 uppercase"><Trophy className="h-3.5 w-3.5" />Best converting</p>
                    <p className="mt-1 font-bold text-gray-900">{best.property.title}</p>
                    <p className="text-sm text-gray-600">{best.conversion.toFixed(2)}% of views became inquiries</p>
                  </div>
                )}
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Average conversion</p>
                  <p className="mt-1 text-2xl font-extrabold text-gray-900">
                    {performance.length ? (performance.reduce((s, r) => s + r.conversion, 0) / performance.length).toFixed(2) : "0.00"}%
                  </p>
                </div>
              </div>
            </div>
          ) : (
            locked("advanced")
          )}
        </Panel>
      </div>

      {/* Recent inquiries */}
      <section className="mt-6 rounded-3xl bg-white p-6 ring-1 ring-gray-200">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Recent inquiries</h2>
          <Link to="/agent/inquiries" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-800">View all <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {recentInquiries.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No inquiries yet" description="When buyers or renters contact you about a property, they'll appear here." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentInquiries.map((inquiry) => (
              <li key={inquiry.id}>
                <Link to={`/agent/inquiries?open=${inquiry.id}`} className="-mx-3 flex items-center gap-4 rounded-2xl px-3 py-3 transition hover:bg-gray-50">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gray-100 text-sm font-bold text-gray-600">{inquiry.name.charAt(0)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900">
                      {inquiry.name}
                      <span className="font-normal text-gray-500"> · {findProperty(inquiry.propertyId)?.title || "Removed property"}</span>
                    </p>
                    <p className="truncate text-sm text-gray-500">{inquiry.message}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={inquiry.status} />
                    <span className="text-xs text-gray-400">{formatRelative(inquiry.createdAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
};

export default Dashboard;
