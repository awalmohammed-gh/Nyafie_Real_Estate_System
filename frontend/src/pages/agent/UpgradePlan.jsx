import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowUpRight, Building2, CalendarDays, Check, Crown, Images, Info, Loader2, Megaphone, RefreshCw, Users } from "lucide-react";
import { useAgent } from "../../hooks/useAgent";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useToast } from "../../context/useToast";
import { subscriptionApi, teamApi } from "../../frontApi";
import PageTitle from "../../components/agent/PageTitle";
import PageLoader from "../../components/ui/PageLoader";
import StatusBadge from "../../components/ui/StatusBadge";
import { ACCOUNT_TYPES, durationLabel, planFeatureList } from "../../data/plans";
import { formatDate } from "../../utils/date";
import { CHECKOUT_RETURN_KEY as RETURN_KEY } from "../../utils/subscription";

const money = (value) => `₵${Number(value || 0).toLocaleString()}`;

// One limit of a higher plan, next to what the provider has now
const Limit = ({ icon: Icon, label, value, now }) => {
  const gain = typeof now === "number" && value > now ? value - now : 0;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3.5 py-3">
      <Icon className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-gray-900">{value}{gain > 0 && <span className="ml-1.5 text-xs font-semibold text-emerald-700">+{gain}</span>}</p>
      </div>
    </div>
  );
};

const StateCard = ({ icon: Icon, tone = "brand", title, children, actions }) => (
  <section className="workspace-card p-8 text-center sm:p-10">
    <span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${tone === "red" ? "bg-red-50 text-red-500" : "bg-brand-50 text-brand-600"}`}><Icon className="h-6 w-6" aria-hidden="true" /></span>
    <h2 className="mt-5 text-lg font-semibold text-gray-900">{title}</h2>
    <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-600">{children}</div>
    {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
  </section>
);

// /agent/subscription/upgrade: only the higher plans of the provider's own account type, priced by the server
const UpgradePlan = () => {
  const { user, permissions: perms, refreshUser } = useAgent();
  const { toast } = useToast();
  const navigate = useNavigate();
  const sub = user.subscription;
  const options = useApiQuery(perms.subscriptionsEnabled ? `upgrades:${sub?.id || "none"}:${sub?.planId || ""}` : null, () => subscriptionApi.getUpgrades());
  const team = useApiQuery(perms.canManageTeam ? "upgrade-team" : "upgrade-team:none", () => (perms.canManageTeam ? teamApi.getTeam() : Promise.resolve(null)));
  const [processing, setProcessing] = useState(null); // the plan whose payment is starting

  // Organisation staff work under the owner's plan; only the owner upgrades it (the server refuses too)
  if (perms.isTeamMember) return <Navigate to="/agent/dashboard" replace />;
  if (!perms.subscriptionsEnabled) return <Navigate to="/agent/subscription" replace />;

  const type = ACCOUNT_TYPES[perms.accountType];
  const current = perms.plan;
  const seatsUsed = team.data ? team.data.members.length : null;
  const data = options.data;

  const upgrade = async (target) => {
    setProcessing(target.id);
    try {
      const started = await subscriptionApi.upgradePlan(target.id);
      // The unused value of the current plan covered it: the server has already switched the plan
      if (started.mode === "credit") {
        await refreshUser();
        toast({ title: "Plan upgraded", description: `You're now on ${target.name}.` });
        navigate("/agent/subscription", { replace: true });
        return;
      }
      try {
        sessionStorage.setItem(RETURN_KEY, JSON.stringify({ reference: started.reference, wasUpgrade: true }));
      } catch {
        // Only changes the confirmation wording
      }
      window.location.assign(started.authorizationUrl);
    } catch (err) {
      setProcessing(null);
      toast({ type: "error", title: "Upgrade not started", description: err.message });
      options.reload(); // e.g. the plan was just retired, or the subscription changed
    }
  };

  let body;
  if (options.loading) body = <section className="workspace-card"><PageLoader size="sm" label="Finding your upgrade options..." /><p className="-mt-4 pb-8 text-center text-sm text-gray-500">Finding your upgrade options...</p></section>;
  else if (options.error)
    body = <StateCard icon={AlertCircle} tone="red" title="We couldn't load your upgrade options" actions={<button type="button" onClick={options.reload} className="btn btn-primary"><RefreshCw className="h-4 w-4" />Try again</button>}>{options.error}</StateCard>;
  else if (data.status !== "active")
    body = (
      <StateCard icon={CalendarDays} title={data.status === "pending" ? "Your payment is awaiting confirmation" : "Upgrades need an active plan"}
        actions={data.status === "pending" ? <Link to="/agent/subscription" className="btn btn-primary">Back to subscription</Link> : <>
          {sub && <Link to={`/agent/subscription/checkout?plan=${sub.planId}`} className="btn btn-primary"><RefreshCw className="h-4 w-4" />Renew {sub.planName}</Link>}
          <Link to="/agent/subscription/plans" className="btn btn-light">Choose a plan</Link>
        </>}>
        {data.status === "pending" ? "Check its status on your subscription page before starting another payment." : `Your plan ${data.status === "none" ? "isn't active" : `is ${data.status}`}. Renew it, or choose any ${type.label.toLowerCase()} plan, to continue.`}
      </StateCard>
    );
  else if (data.highest)
    body = (
      <StateCard icon={Crown} title="You're on the highest available plan"
        actions={<><Link to="/agent/subscription" className="btn btn-light">Back to subscription</Link>{sub && <Link to={`/agent/subscription/checkout?plan=${sub.planId}`} className="btn btn-primary"><RefreshCw className="h-4 w-4" />Renew {sub.planName}</Link>}</>}>
        {data.currentPlan?.name || current?.name} is the top {type.label.toLowerCase()} plan on NyaFie right now. You can renew it any time to extend your current period.
      </StateCard>
    );
  else
    body = (
      <>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.upgrades.map(({ plan, quote }) => {
            const busy = processing === plan.id;
            return (
              <article key={plan.id} className="workspace-card flex flex-col p-6 sm:p-7">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                  {plan.popular && <StatusBadge status="Most popular" tone="brand" dot={false} />}
                </div>
                {plan.tagline && <p className="mt-1 text-sm text-gray-500">{plan.tagline}</p>}
                <p className="mt-5"><span className="text-3xl font-semibold tracking-tight text-gray-900">{money(plan.price)}</span><span className="text-sm text-gray-500"> / {durationLabel(plan.durationDays)}</span></p>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <Limit icon={Building2} label="Listings" value={plan.propertyLimit} now={current?.propertyLimit} />
                  {perms.isOrganization && <Limit icon={Users} label="Team members" value={plan.teamMemberLimit} now={current?.teamMemberLimit} />}
                  <Limit icon={Images} label="Photos each" value={plan.imageLimit} now={current?.imageLimit} />
                  <Limit icon={Megaphone} label="Featured" value={plan.featuredLimit} now={current?.featuredLimit} />
                </div>

                <ul className="mt-5 mb-6 space-y-2">
                  {planFeatureList(plan).filter((feature) => !/^Up to |featured listings$/i.test(feature)).map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-gray-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />{feature}</li>
                  ))}
                </ul>

                <dl className="mt-auto space-y-2 border-t border-gray-100 pt-4 text-sm">
                  {quote.credit > 0 && <div className="flex justify-between gap-3"><dt className="text-gray-500">Credit for {quote.remainingDays} {quote.remainingDays === 1 ? "day" : "days"} left on {quote.currentPlan?.name}</dt><dd className="shrink-0 font-medium text-emerald-700">−{money(quote.credit)}</dd></div>}
                  <div className="flex justify-between gap-3"><dt className="text-gray-500">Runs</dt><dd className="font-medium text-gray-900">{formatDate(quote.startsAt)} – {formatDate(quote.expiresAt)}</dd></div>
                  <div className="flex justify-between gap-3 text-base"><dt className="font-semibold text-gray-900">Due today</dt><dd className="font-semibold text-gray-900">{money(quote.amount)}</dd></div>
                </dl>

                <button type="button" onClick={() => upgrade(plan)} disabled={Boolean(processing)} aria-busy={busy} className="btn btn-primary mt-6 w-full py-3">
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</> : <><ArrowUpRight className="h-4 w-4" />Upgrade to {plan.name}</>}
                </button>
              </article>
            );
          })}
        </div>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-gray-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          The upgrade starts as soon as Paystack confirms your payment. The unused value of your current plan is taken off the price, and the new plan runs for its full period from that day. Your listings, team and history stay exactly as they are.
        </p>
      </>
    );

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Your subscription" title={`Upgrade your ${type.label.toLowerCase()} plan`} description={`Only higher ${type.plural.toLowerCase()} are shown. Prices are worked out by NyaFie from your current plan.`}
        action={<Link to="/agent/subscription" className="btn btn-light"><ArrowLeft className="h-4 w-4" />Back to subscription</Link>} />

      <section className="workspace-card">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-4 sm:p-6">
          <div className="col-span-2 sm:col-span-1"><dt className="text-gray-500">Current plan</dt><dd className="mt-1 font-semibold text-gray-900">{current?.name || sub?.planName || "None"}</dd></div>
          <div><dt className="text-gray-500">Listings</dt><dd className="mt-1 font-semibold text-gray-900">{perms.activeCount} / {perms.propertyLimit}</dd></div>
          {perms.isOrganization && <div><dt className="text-gray-500">Team members</dt><dd className="mt-1 font-semibold text-gray-900">{seatsUsed ?? "…"} / {perms.teamMemberLimit}</dd></div>}
          <div><dt className="text-gray-500">Expires</dt><dd className="mt-1 font-semibold text-gray-900">{sub ? formatDate(sub.expiryDate) : "—"}</dd></div>
        </dl>
      </section>

      {body}
    </div>
  );
};

export default UpgradePlan;
