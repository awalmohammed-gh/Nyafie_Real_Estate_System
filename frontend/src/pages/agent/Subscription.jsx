import { Link, Navigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check, CreditCard, Crown, Lock, RefreshCw } from "lucide-react";
import { useAgent } from "../../hooks/useAgent";
import PageTitle from "../../components/agent/PageTitle";
import StatusBadge from "../../components/ui/StatusBadge";
import { ACCOUNT_TYPES, ANALYTICS_LEVELS, durationLabel } from "../../data/plans";
import { formatDate } from "../../utils/date";
import { useApiQuery } from "../../hooks/useApiQuery";
import { teamApi } from "../../frontApi";

const Meter = ({ label, used, limit }) => <div><div className="flex justify-between gap-3 text-sm"><p className="text-gray-500">{label}</p><p className="font-semibold text-gray-900">{used} / {limit}</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit || 1} aria-valuenow={Math.min(used, limit || 1)}><div className={`h-full rounded-full ${used >= limit ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${limit ? Math.min(100, used / limit * 100) : 0}%` }} /></div></div>;

// What the current plan includes. Locked features stay listed, with the way to unlock them:
// a higher plan of the same account type, a renewal, or nothing when this is the highest plan.
const featureRows = (perms, companyName, renewPath) => {
  const unlock = perms.canUpgrade ? { to: perms.upgradePath, label: "Upgrade" } : !perms.isActive ? { to: renewPath, label: "Renew" } : null;
  const on = (value) => (perms.isActive ? value : null);
  return [
    { label: "Property listings", value: on(`Up to ${perms.propertyLimit} active`) },
    { label: "Photos per property", value: on(String(perms.imageLimit)) },
    { label: "Customer inquiries", value: on("Included") },
    { label: "Calls, email & WhatsApp", value: on("Included") },
    { label: "HomeBase customer chat", value: perms.canUseChat ? "Included" : null },
    { label: "Inquiry status tracking", value: perms.canManageInquiries ? "Included" : null },
    { label: "Advanced analytics", value: perms.canViewAdvancedAnalytics ? "Included" : null },
    { label: "Featured listings", value: perms.isActive && perms.featuredLimit > 0 ? `Up to ${perms.featuredLimit}` : null },
    { label: "Priority search visibility", value: perms.isActive && perms.plan?.priorityVisibility ? "Included" : null },
    ...(perms.isOrganization ? [
      { label: "Team members", value: perms.isActive && perms.teamMemberLimit > 0 ? `Up to ${perms.teamMemberLimit}` : null, to: perms.isActive && perms.teamMemberLimit > 0 ? "/agent/team" : null },
      { label: "Company profile & logo", value: companyName ? "Included" : "Add your company details", to: companyName ? null : "/agent/settings" },
    ] : []),
  ].map((row) => ({ ...row, unlock }));
};

const Subscription = () => {
  const { user, permissions: perms } = useAgent();
  // Seats in use, from the team's own records (agency and company owners)
  const team = useApiQuery(perms.canManageTeam ? "subscription-team" : "subscription-team:none", () => (perms.canManageTeam ? teamApi.getTeam() : Promise.resolve(null)));
  // Agency and company staff work under the organisation's plan, which its owner manages
  if (perms.isTeamMember) return <Navigate to="/agent/dashboard" replace />;
  const seatsUsed = team.data ? team.data.members.length : null;
  const sub = user.subscription;
  const plan = perms.plan;
  const state = perms.subscription;
  const type = ACCOUNT_TYPES[perms.accountType];
  const renewPath = sub ? `/agent/subscription/checkout?plan=${sub.planId}` : "/agent/subscription/plans";
  const tone = state.isActive ? state.expiringSoon ? "amber" : "green" : state.status === "pending" ? "amber" : "gray";
  const message = !sub
    ? perms.isActive ? "Your account currently uses the platform's default plan. A paid subscription is optional while this requirement is waived." : "Choose a plan to start publishing your properties."
    : state.isActive
      ? state.expiringSoon ? `Your plan ends in ${state.daysRemaining} days. Renew early to keep your listings available.` : perms.isHighestPlan ? "You're on the highest available plan. Renewing early adds time to your current expiry date." : "Your plan is active. Upgrade any time for higher limits, or renew early to add time to your expiry date."
      : state.status === "pending" ? "Your payment is awaiting confirmation. Check its status before starting another payment." : "Your listings are saved. Renew your plan to restore publishing and public visibility.";

  return <div className="space-y-6">
    <PageTitle title="Your subscription" eyebrow="Your account" description="Your current plan, what you're using, and when it renews." />
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="workspace-card">
        <div className="workspace-card-header"><h2>Current plan</h2><StatusBadge status={sub ? state.statusLabel : perms.isActive ? "Subscription waived" : "No subscription"} tone={tone} /></div>
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="workspace-eyebrow">{type.label} plan</p>
              <div className="mt-3 flex flex-wrap items-center gap-2"><h2 className="text-3xl font-semibold tracking-tight text-gray-900">{plan?.name || sub?.planName || "Choose your plan"}</h2>{perms.isHighestPlan && <StatusBadge status="Highest plan" tone="brand" dot={false} />}</div>
              {sub && <p className="mt-2 text-sm text-gray-500">₵{Number(plan?.price ?? sub.price ?? 0).toLocaleString()} / {plan ? durationLabel(plan.durationDays) : "billing period"}</p>}
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">{perms.isHighestPlan ? <Crown className="h-6 w-6" /> : <CreditCard className="h-6 w-6" />}</span>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-gray-500">{message}</p>
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-gray-100 pt-5 text-sm sm:grid-cols-4">
            <div><dt className="text-gray-500">Status</dt><dd className="mt-1 font-semibold text-gray-900">{sub ? state.statusLabel : perms.isActive ? "Waived" : "None"}</dd></div>
            <div><dt className="text-gray-500">Started</dt><dd className="mt-1 font-semibold text-gray-900">{sub ? formatDate(sub.startDate) : "—"}</dd></div>
            <div><dt className="text-gray-500">Expires</dt><dd className="mt-1 font-semibold text-gray-900">{sub ? formatDate(sub.expiryDate) : "—"}</dd></div>
            <div><dt className="text-gray-500">Days left</dt><dd className="mt-1 font-semibold text-gray-900">{state.isActive ? state.daysRemaining : "—"}</dd></div>
          </dl>
          <div className="mt-7 flex flex-wrap gap-3">
            {perms.canUpgrade && <Link to={perms.upgradePath} className="btn btn-primary"><ArrowUpRight className="h-4 w-4" />Upgrade Plan</Link>}
            {sub && state.status !== "pending" && <Link to={renewPath} className={`btn ${perms.canUpgrade ? "btn-light" : "btn-primary"}`}><RefreshCw className="h-4 w-4" />Renew {plan?.name || sub.planName}</Link>}
            {!state.isActive && state.status !== "pending" && <Link to="/agent/subscription/plans" className={`btn ${sub ? "btn-light" : "btn-primary"}`}>{sub ? "Choose a different plan" : "Choose a plan"}<ArrowRight className="h-4 w-4" /></Link>}
          </div>
        </div>
      </section>
      <section className="workspace-card">
        <div className="workspace-card-header"><div><h2>Plan usage</h2><p>Live listings and listings in review count.</p></div></div>
        <div className="space-y-6 p-6">
          <Meter label="Property listings" used={perms.activeCount} limit={perms.propertyLimit} />
          {perms.isOrganization && seatsUsed !== null && <Meter label="Team members" used={seatsUsed} limit={perms.teamMemberLimit} />}
          <Meter label="Featured properties" used={perms.featuredCount} limit={perms.featuredLimit} />
          {perms.isOrganization && seatsUsed > perms.teamMemberLimit && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">Your team is larger than this plan allows. Everyone keeps access, but you can't invite anyone new until you upgrade or the team is within the limit.</p>}
          {perms.limitReached && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">{perms.activeCount > perms.propertyLimit ? `You have ${perms.activeCount} active listings, more than this plan allows. They all stay as they are; new listings are paused until you are under ${perms.propertyLimit}${perms.canUpgrade ? " or upgrade" : ""}.` : `You've reached your listing limit.${perms.canUpgrade ? " Upgrade to publish more;" : ""} Your drafts remain available.`}</p>}
          <div className="flex items-center justify-between border-t border-gray-100 pt-4 text-sm"><span className="text-gray-500">Photos per property</span><span className="font-semibold text-gray-900">{perms.imageLimit}</span></div>
          <div className="flex items-center justify-between text-sm"><span className="text-gray-500">Analytics</span><span className="font-semibold text-gray-900">{ANALYTICS_LEVELS[perms.analyticsLevel]?.label || "Basic"}</span></div>
        </div>
      </section>
    </div>
    <section className="workspace-card">
      <div className="workspace-card-header"><div><h2>Your current features</h2><p>{perms.isActive ? `What your ${plan?.name || "current"} plan includes.` : "Renew your plan to unlock these features again. Your data is safe."}</p></div></div>
      <ul className="divide-y divide-gray-100">
        {featureRows(perms, user.agentApplication?.companyName, renewPath).map(({ label, value, unlock, to }) => (
          <li key={label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-3.5 text-sm">
            <span className="text-gray-700">{label}</span>
            {value ? (
              to ? <Link to={to} className="font-semibold text-brand-700 hover:text-brand-800">{value}</Link>
                : <span className="flex items-center gap-1.5 font-semibold text-gray-900"><Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />{value}</span>
            ) : (
              <span className="flex items-center gap-3"><span className="flex items-center gap-1.5 text-gray-400"><Lock className="h-3.5 w-3.5" aria-hidden="true" />{unlock ? "Locked" : "Not in your plan"}</span>{unlock && <Link to={unlock.to} className="text-xs font-semibold text-brand-700 hover:text-brand-800">{unlock.label}</Link>}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
    {sub && <section className="workspace-card"><div className="workspace-card-header"><h2>Last payment</h2><StatusBadge status={sub.paymentStatus} /></div><dl className="grid gap-5 p-6 text-sm sm:grid-cols-3"><div><dt className="text-xs text-gray-500">Payment method</dt><dd className="mt-2 font-semibold text-gray-900">{sub.paymentMethod || "—"}</dd></div><div><dt className="text-xs text-gray-500">Amount & date</dt><dd className="mt-2 font-semibold text-gray-900">₵{Number(sub.price || 0).toLocaleString()}<span className="mt-1 block text-xs font-normal text-gray-500">{formatDate(sub.paidAt || sub.startDate)}</span></dd></div><div><dt className="text-xs text-gray-500">Payment reference</dt><dd className="mt-2 break-all font-mono text-xs text-gray-900">{sub.reference || "—"}</dd></div></dl></section>}
  </div>;
};
export default Subscription;
