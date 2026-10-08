import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Check, CreditCard, Lock, RefreshCw } from "lucide-react";
import { useAgent } from "../../hooks/useAgent";
import PageTitle from "../../components/agent/PageTitle";
import WorkspaceStats from "../../components/agent/WorkspaceStats";
import StatusBadge from "../../components/ui/StatusBadge";
import { ANALYTICS_LEVELS, durationLabel, planFeatureList } from "../../data/plans";
import { formatDate } from "../../utils/date";

const Meter = ({ label, used, limit }) => <div><div className="flex justify-between gap-3 text-sm"><p className="text-gray-500">{label}</p><p className="font-semibold text-gray-900">{used} / {limit}</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit || 1} aria-valuenow={Math.min(used, limit || 1)}><div className={`h-full rounded-full ${used >= limit ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${limit ? Math.min(100, used / limit * 100) : 0}%` }} /></div></div>;
const Subscription = () => {
  const { user, permissions: perms } = useAgent();
  const sub = user.subscription;
  const plan = perms.plan;
  const state = perms.subscription;
  const tone = state.isActive ? state.expiringSoon ? "amber" : "green" : "gray";
  return <div className="space-y-6">
    <PageTitle title="Your subscription" description="A clear view of your plan, listing limits, and next renewal." eyebrow="Your account" action={<Link to="/agent/subscription/plans" className="btn btn-light">Compare plans<ArrowRight className="h-4 w-4" /></Link>} />
    <WorkspaceStats items={[
      { label: "Days remaining", value: sub ? state.daysRemaining : "—", note: sub ? `Ends ${formatDate(sub.expiryDate)}` : "Subscription not on file", icon: CalendarDays },
      { label: "Listing slots used", value: `${perms.activeCount} / ${perms.propertyLimit}`, note: `${perms.remainingListings} slots available` },
      { label: "Photos per property", value: perms.imageLimit, note: "Your current upload limit" },
      { label: "Featured listings", value: `${perms.featuredCount} / ${perms.featuredLimit}`, note: "Extra visibility for your properties" },
    ]} />
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="workspace-card"><div className="workspace-card-header"><h2>Current plan</h2><StatusBadge status={sub ? state.statusLabel : perms.isActive ? "Subscription waived" : "No subscription"} tone={tone} /></div><div className="p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="workspace-eyebrow">Your business plan</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">{plan?.name || sub?.planName || "Choose your plan"}</h2>{sub && <p className="mt-2 text-sm text-gray-500">₵{Number(sub.price || 0).toLocaleString()} / {plan ? durationLabel(plan.durationDays) : "billing period"}</p>}</div><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700"><CreditCard className="h-6 w-6" /></span></div>
      <p className="mt-5 text-sm leading-relaxed text-gray-500">{!sub ? perms.isActive ? "Your account currently uses the platform's default plan. A paid subscription is optional while this requirement is waived." : "Choose a plan to start publishing your properties." : state.isActive ? state.expiringSoon ? `Your plan ends in ${state.daysRemaining} days. Renew early to keep your listings available.` : "Your plan is active. Early renewal adds time to your current expiry date." : state.status === "pending" ? "Your payment is awaiting confirmation. Check its status before starting another payment." : "Your listings are saved. Renew your plan to restore publishing and public visibility."}</p>
      {sub && <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-gray-100 pt-5 text-sm"><div><dt className="text-gray-500">Period started</dt><dd className="mt-1 font-semibold text-gray-900">{formatDate(sub.startDate)}</dd></div><div><dt className="text-gray-500">Period ends</dt><dd className="mt-1 font-semibold text-gray-900">{formatDate(sub.expiryDate)}</dd></div></dl>}
      <div className="mt-7 flex flex-wrap gap-3">{sub && state.status !== "pending" && <Link to={`/agent/subscription/checkout?plan=${sub.planId}`} className="btn btn-primary"><RefreshCw className="h-4 w-4" />Renew {plan?.name || sub.planName}</Link>}<Link to="/agent/subscription/plans" className={`btn ${sub ? "btn-light" : "btn-primary"}`}>{sub ? "Change plan" : "Choose a plan"}<ArrowRight className="h-4 w-4" /></Link></div></div></section>
      <section className="workspace-card"><div className="workspace-card-header"><div><h2>Plan usage</h2><p>Live listings and listings in review count.</p></div></div><div className="space-y-6 p-6"><Meter label="Property listings" used={perms.activeCount} limit={perms.propertyLimit} /><Meter label="Featured properties" used={perms.featuredCount} limit={perms.featuredLimit} />{perms.limitReached && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">You've reached your listing limit. Upgrade to publish more; your drafts remain available.</p>}<div className="flex items-center justify-between border-t border-gray-100 pt-4 text-sm"><span className="text-gray-500">Analytics</span><span className="font-semibold text-gray-900">{ANALYTICS_LEVELS[perms.analyticsLevel]?.label || "Basic"}</span></div>{!perms.canUseFeatured && <p className="flex items-start gap-2 text-xs leading-relaxed text-gray-500"><Lock className="h-4 w-4 shrink-0" />Featured placement is available with eligible plans.</p>}</div></section>
    </div>
    {plan && <details className="workspace-card"><summary className="cursor-pointer px-6 py-5 text-sm font-semibold text-gray-900">What's included in {plan.name}</summary><ul className="grid gap-3 border-t border-gray-100 p-6 sm:grid-cols-2">{planFeatureList(plan).map((feature) => <li key={feature} className="flex items-start gap-2 text-sm text-gray-600"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{feature}</li>)}</ul></details>}
    {sub && <section className="workspace-card"><div className="workspace-card-header"><h2>Last payment</h2><StatusBadge status={sub.paymentStatus} /></div><dl className="grid gap-5 p-6 text-sm sm:grid-cols-3"><div><dt className="text-xs text-gray-500">Payment method</dt><dd className="mt-2 font-semibold text-gray-900">{sub.paymentMethod || "—"}</dd></div><div><dt className="text-xs text-gray-500">Amount & date</dt><dd className="mt-2 font-semibold text-gray-900">₵{Number(sub.price || 0).toLocaleString()}<span className="mt-1 block text-xs font-normal text-gray-500">{formatDate(sub.paidAt || sub.startDate)}</span></dd></div><div><dt className="text-xs text-gray-500">Payment reference</dt><dd className="mt-2 break-all font-mono text-xs text-gray-900">{sub.reference || "—"}</dd></div></dl></section>}
  </div>;
};
export default Subscription;
