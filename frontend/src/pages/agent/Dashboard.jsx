import { Link } from "react-router-dom";
import { ArrowRight, Building2, CheckCircle2, Eye, HandCoins, Inbox, KeyRound, Plus, Sparkles } from "lucide-react";
import { useAgent } from "../../hooks/useAgent";
import { useRealEstate } from "../../context/useRealEstate";
import { useTransactions } from "../../context/useTransactions";
import PageTitle from "../../components/agent/PageTitle";
import WorkspaceStats from "../../components/agent/WorkspaceStats";
import ActivityFeed from "../../components/dashboard/ActivityFeed";
import { ErrorState } from "../../components/dashboard/States";
import StatusBadge from "../../components/ui/StatusBadge";
import EmptyState from "../../components/ui/EmptyState";
import { buildActivity } from "../../utils/activity";
import { formatDate, formatRelative } from "../../utils/date";
import { formatLocation, formatPrice, getInitials, getListingStatus } from "../../utils/property";
import { formatCedis } from "../../utils/reports";

const SectionHeader = ({ title, description, to, label = "View all" }) => <header className="workspace-card-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{to && <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700">{label}<ArrowRight className="h-3.5 w-3.5" /></Link>}</header>;

const Dashboard = () => {
  const { user, myProperties, myInquiries, permissions: perms } = useAgent();
  const { findProperty, isPubliclyVisible } = useRealEstate();
  const { offers, rentals, sales, pending, loading, error, reload } = useTransactions();
  const live = myProperties.filter(isPubliclyVisible).length;
  const freshInquiries = myInquiries.filter((i) => i.status === "New");
  const drafts = myProperties.filter((p) => p.listing.state === "draft");
  const rejected = myProperties.filter((p) => p.listing.state === "rejected");
  const recent = [...myProperties].sort((a, b) => new Date(b.listing.createdAt) - new Date(a.listing.createdAt)).slice(0, 4);
  const recentInquiries = [...myInquiries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
  const recentOffers = [...offers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
  const activity = buildActivity({ base: "/agent", offers, rentals, sales, inquiries: myInquiries, findProperty, limit: 5 });
  const tasks = [
    { icon: Inbox, label: "New inquiries", count: freshInquiries.length, detail: "Customers waiting to hear from you", to: "/agent/inquiries" },
    { icon: HandCoins, label: "Offers to review", count: pending.offers, detail: "Accept, counter or decline an offer", to: "/agent/offers" },
    { icon: KeyRound, label: "Rental & sale requests", count: pending.rentals + pending.sales, detail: "Move your customer requests forward", to: pending.rentals ? "/agent/rentals" : "/agent/sale-requests" },
    { icon: Building2, label: "Listings to finish", count: drafts.length + rejected.length, detail: rejected.length ? "Review feedback and complete your drafts" : "Complete and submit your drafts", to: "/agent/properties" },
  ].filter((task) => task.count > 0);
  const usage = perms.propertyLimit ? Math.min(100, perms.activeCount / perms.propertyLimit * 100) : 0;
  const propertyStatus = (p) => getListingStatus(p, p.listing.state !== "published" || isPubliclyVisible(p));

  return <div className="space-y-6">
    <PageTitle title={`Good to see you, ${user.firstName}.`} eyebrow={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} description="Your listings, your customers, and what needs your attention today." action={perms.canCreateDraft && <Link to="/agent/properties/add" className="btn btn-primary"><Plus className="h-4 w-4" />Add property</Link>} />
    <WorkspaceStats items={[
      { label: "Live properties", value: live, note: `${myProperties.length} listings in your portfolio`, icon: Building2, to: "/agent/properties" },
      { label: "Property views", value: myProperties.reduce((n, p) => n + (p.meta?.views || 0), 0).toLocaleString(), note: "Across all your listings", icon: Eye, to: "/agent/properties" },
      { label: "New inquiries", value: freshInquiries.length, note: "Waiting for your response", icon: Inbox, to: "/agent/inquiries" },
      { label: "Pending offers", value: loading ? "—" : pending.offers, note: "Ready for your review", icon: HandCoins, to: "/agent/offers" },
    ]} />
    {error && <ErrorState title="Customer activity is unavailable" message={error} onRetry={reload} />}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="workspace-card"><SectionHeader title="Your next actions" description="A short list to keep your business moving." />
        {loading ? <p className="p-6 text-sm text-gray-500" role="status">Checking your customer activity...</p> : tasks.length ? <div className="grid divide-y divide-gray-100 sm:grid-cols-2 sm:divide-y-0">{tasks.map(({ icon: Icon, ...task }) => <Link key={task.label} to={task.to} className="group flex items-start gap-3 p-5 transition hover:bg-brand-50/50"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="flex items-center justify-between gap-2 text-sm font-semibold text-gray-900">{task.label}<span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs tabular-nums">{task.count}</span></p><p className="mt-1 text-xs leading-relaxed text-gray-500">{task.detail}</p></div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gray-400 group-hover:text-brand-700" /></Link>)}</div> : <div className="flex items-center gap-4 p-6"><CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" /><div><p className="font-semibold text-gray-900">You're up to date.</p><p className="mt-1 text-sm text-gray-500">New inquiries, offers and requests will appear here.</p></div></div>}
      </section>
      <aside className="workspace-card p-5"><div className="flex items-start justify-between gap-3"><div><p className="workspace-eyebrow">Your subscription</p><h2 className="mt-2 text-lg font-semibold text-gray-900">{perms.plan?.name || user.subscription?.planName || "No paid"} plan</h2></div><Sparkles className="h-5 w-5 text-brand-600" /></div><p className="mt-2 text-sm text-gray-500">{user.subscription ? `${perms.subscription.isActive ? "Renews" : "Ended"} ${formatDate(user.subscription.expiryDate)}` : "Plan limits set by HomeBase"}</p><div className="mt-5 flex justify-between text-xs"><span className="text-gray-500">Listing usage</span><span className="font-semibold text-gray-900">{perms.activeCount} / {perms.propertyLimit}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label="Listing usage" aria-valuemin={0} aria-valuemax={perms.propertyLimit || 1} aria-valuenow={Math.min(perms.activeCount, perms.propertyLimit || 1)}><div className={`h-full rounded-full ${perms.limitReached ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${usage}%` }} /></div><Link to="/agent/subscription" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-700">{perms.isActive ? "Manage plan" : "Review your subscription"}<ArrowRight className="h-4 w-4" /></Link></aside>
    </div>
    <section className="workspace-card"><SectionHeader title="Recent properties" description="Keep an eye on your latest listings." to="/agent/properties" label="All properties" />{recent.length ? <div className="grid gap-px bg-gray-100 md:grid-cols-2">{recent.map((p) => <Link key={p.id} to={`/agent/properties/${p.id}`} className="flex min-w-0 items-center gap-4 bg-white p-5 transition hover:bg-gray-50"><img src={p.media.images[0]} alt="" className="h-20 w-24 shrink-0 rounded-xl bg-gray-100 object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900">{p.title}</p><p className="mt-1 truncate text-xs text-gray-500">{formatLocation(p.location)}</p><p className="mt-2 text-sm font-semibold text-gray-900">{formatPrice(p)}</p><div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge status={propertyStatus(p)} /><span className="text-xs text-gray-400">{p.meta?.views || 0} views</span></div></div><ArrowRight className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" /></Link>)}</div> : <EmptyState icon={Building2} title="Build your property portfolio" description="Add your first listing, save a draft, and publish when you're ready." action={perms.canCreateDraft && <Link to="/agent/properties/add" className="btn btn-primary">Add your first property</Link>} />}</section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="workspace-card"><SectionHeader title="Latest inquiries" to="/agent/inquiries" />{recentInquiries.length ? <ul className="divide-y divide-gray-100">{recentInquiries.map((i) => <li key={i.id}><Link to={`/agent/inquiries?open=${i.id}`} className="flex items-start gap-3 p-5 hover:bg-gray-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{getInitials(i.name)}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-gray-900">{i.name}</p><p className="mt-1 truncate text-xs text-gray-500">{findProperty(i.propertyId)?.title || "Removed property"}</p><p className="mt-1 line-clamp-1 text-sm text-gray-600">{i.message}</p></div><div className="text-right"><StatusBadge status={i.status} /><p className="mt-1 text-[11px] text-gray-400">{formatRelative(i.createdAt)}</p></div></Link></li>)}</ul> : <p className="p-6 text-sm text-gray-500">Customer inquiries will appear here.</p>}</section>
      <section className="workspace-card"><SectionHeader title="Latest offers" to="/agent/offers" />{loading ? <p className="p-6 text-sm text-gray-500" role="status">Loading offers…</p> : recentOffers.length ? <ul className="divide-y divide-gray-100">{recentOffers.map((o) => <li key={o.id}><Link to={`/agent/offers?property=${o.property.id}`} className="flex items-center gap-3 p-5 hover:bg-gray-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gray-50 text-brand-600"><HandCoins className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900">{o.customer?.name || "Customer"}</p><p className="mt-1 truncate text-xs text-gray-500">{o.property.title}</p></div><div className="text-right"><p className="text-sm font-semibold text-gray-900">{formatCedis(o.amount)}</p><StatusBadge status={o.status} className="mt-1" /></div></Link></li>)}</ul> : <p className="p-6 text-sm text-gray-500">Offers on your listings will appear here.</p>}</section>
    </div>
    <section className="workspace-card"><SectionHeader title="Recent activity" description="The latest changes across your properties and customer requests." /><ActivityFeed items={activity} loading={loading} /></section>
  </div>;
};
export default Dashboard;
