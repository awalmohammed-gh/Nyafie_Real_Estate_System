import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { AlertTriangle, ArrowUpRight, CalendarCheck, CalendarX, Check, Lock, RefreshCw } from "lucide-react";
import { useAgent } from "../../hooks/useAgent";
import { usePlatform } from "../../context/usePlatform";
import PageTitle from "../../components/agent/PageTitle";
import StatusBadge from "../../components/ui/StatusBadge";
import { ANALYTICS_LEVELS, durationLabel } from "../../data/plans";
import { formatDate } from "../../utils/date";

const statusTone = { active: "green", expiring: "amber", expired: "red", cancelled: "gray", pending: "amber" };

const Meter = ({ label, used, limit, message }) => {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-sm font-semibold text-gray-900 tabular-nums">{used} / {limit} used</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-brand-500"}`}
        />
      </div>
      {message && <p className={`mt-2 text-xs font-medium ${pct >= 100 ? "text-red-600" : "text-amber-700"}`}>{message}</p>}
    </div>
  );
};

const Subscription = () => {
  const { user, myProperties, permissions: perms } = useAgent();
  const { plans } = usePlatform();
  const sub = user.subscription;
  const plan = perms.plan;
  const state = perms.subscription;
  const inactive = !state.isActive;

  const totalDays = Math.max(1, Math.round((new Date(sub.expiryDate) - new Date(sub.startDate)) / 86400000));
  const elapsedPercent = state.isActive ? Math.min(100, Math.round(((totalDays - state.daysRemaining) / totalDays) * 100)) : 100;
  const sorted = [...plans].filter((p) => p.active).sort((a, b) => a.price - b.price);
  const nextPlan = sorted.find((p) => p.price > (plan?.price ?? 0));

  // What the plan includes, with locked items shown so upgrades are understandable
  const featureRows = plan
    ? [
        { label: `Up to ${plan.propertyLimit} active properties`, on: true },
        { label: `Up to ${perms.imageLimit} photos per property`, on: true },
        { label: plan.featuredLimit > 0 ? `${plan.featuredLimit} featured listings` : "Featured listings", on: plan.featuredLimit > 0 },
        { label: "Property view analytics", on: true },
        { label: "Inquiry statistics & property performance", on: plan.analytics !== "basic" },
        { label: "Advanced listing performance analytics", on: plan.analytics === "advanced" },
        { label: plan.inquiryManagement === "full" ? "Full inquiry management" : "Inquiry status tracking", on: plan.inquiryManagement === "full" },
        { label: "Priority visibility in search", on: plan.priorityVisibility },
        ...(plan.extraFeatures || []).map((f) => ({ label: f, on: true })),
      ]
    : [];

  const propertyMessage = perms.limitReached
    ? "Property limit reached. Upgrade your plan to add more properties."
    : perms.nearLimit
      ? "You are close to your property limit."
      : null;

  return (
    <>
      <PageTitle title="Subscription" description="Your plan, limits, usage and renewal." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Plan */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={`relative overflow-hidden rounded-3xl p-6 sm:p-8 lg:col-span-2 ${inactive ? "bg-white ring-2 ring-red-200" : "bg-gray-900 text-white"}`}
        >
          {!inactive && <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-brand-500/30 blur-3xl" />}
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={`text-sm ${inactive ? "text-gray-500" : "text-gray-400"}`}>Current plan</p>
              <StatusBadge status={state.statusLabel} tone={statusTone[state.status]} />
            </div>
            <h2 className={`mt-2 text-3xl font-extrabold tracking-tight ${inactive ? "text-gray-900" : ""}`}>{plan?.name || sub.planName}</h2>
            <p className={inactive ? "text-gray-600" : "text-gray-300"}>
              ₵{sub.price.toLocaleString()} for {plan ? durationLabel(plan.durationDays) : `${totalDays} days`}
            </p>

            {inactive && (
              <p className="mt-5 flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                {state.status === "pending"
                  ? "Your payment is waiting for confirmation. Your plan starts as soon as it's confirmed."
                  : `Your subscription is ${state.statusLabel.toLowerCase()}. Your ${myProperties.length} properties are safe and visible to you, but hidden from the public. Publishing and plan features are paused until you renew.`}
              </p>
            )}

            <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className={`flex items-center gap-1.5 text-sm ${inactive ? "text-gray-500" : "text-gray-400"}`}><CalendarCheck className="h-4 w-4" /> Start date</dt>
                <dd className="mt-1 font-semibold">{formatDate(sub.startDate)}</dd>
              </div>
              <div>
                <dt className={`flex items-center gap-1.5 text-sm ${inactive ? "text-gray-500" : "text-gray-400"}`}><CalendarX className="h-4 w-4" /> Expiry date</dt>
                <dd className={`mt-1 font-semibold ${inactive ? "text-red-600" : ""}`}>{formatDate(sub.expiryDate)}</dd>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <dt className={`text-sm ${inactive ? "text-gray-500" : "text-gray-400"}`}>Days remaining</dt>
                <dd className={`mt-1 text-2xl font-extrabold ${inactive ? "text-red-600" : state.expiringSoon ? "text-amber-300" : ""}`}>{state.daysRemaining}</dd>
              </div>
            </dl>

            <div className="mt-6">
              <div className={`h-2 overflow-hidden rounded-full ${inactive ? "bg-red-100" : "bg-white/10"}`}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${elapsedPercent}%` }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  className={`h-full rounded-full ${inactive ? "bg-red-500" : state.expiringSoon ? "bg-amber-400" : "bg-brand-400"}`}
                />
              </div>
              <p className={`mt-2 text-xs ${inactive ? "text-gray-500" : "text-gray-400"}`}>{inactive ? "Billing period ended" : `${elapsedPercent}% of your billing period used`}</p>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {state.status !== "pending" && (
                <Link to={`/agent/checkout?plan=${sub.planId}`} className="btn btn-primary">
                  <RefreshCw className="h-4 w-4" />
                  {inactive ? "Renew Subscription" : `Renew ${plan?.name || sub.planName}`}
                </Link>
              )}
              <Link to="/agent/plans#plans" className={`btn ${inactive ? "btn-light" : "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20"}`}>
                {nextPlan ? `Upgrade to ${nextPlan.name}` : "Change plan"}
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </motion.section>

        {/* Usage */}
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="space-y-6 rounded-3xl bg-white p-6 ring-1 ring-gray-200 sm:p-8">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Usage</h2>
            <p className="mt-1 text-sm text-gray-500">Published and pending listings count towards your limit. Drafts don't.</p>
          </div>
          <Meter label="Properties" used={perms.activeCount} limit={perms.propertyLimit} message={propertyMessage} />
          {perms.featuredLimit > 0 ? (
            <Meter label="Featured listings" used={perms.featuredCount} limit={perms.featuredLimit} message={perms.featuredCount >= perms.featuredLimit ? "Featured limit reached." : null} />
          ) : (
            <p className="flex items-start gap-2 rounded-2xl bg-gray-50 p-3 text-sm text-gray-600">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              Featured listings are not available on your current plan.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl bg-gray-50 p-3">
              <p className="text-lg font-bold text-gray-900">{perms.imageLimit}</p>
              <p className="text-xs text-gray-500">Photos per property</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-3">
              <p className="text-lg font-bold text-gray-900">{ANALYTICS_LEVELS[perms.analyticsLevel]?.label}</p>
              <p className="text-xs text-gray-500">Analytics</p>
            </div>
          </div>
        </motion.section>
      </div>

      {/* Features */}
      <section className="mt-6 rounded-3xl bg-white p-6 ring-1 ring-gray-200 sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">What's included</h2>
            <p className="text-sm text-gray-500">Features on your {plan?.name} plan. Locked items are available on higher plans.</p>
          </div>
          {nextPlan && <Link to="/agent/plans#plans" className="text-sm font-semibold text-brand-600 hover:text-brand-800">Compare plans</Link>}
        </div>
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {featureRows.map((f) => (
            <li key={f.label} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ${f.on ? "bg-brand-50/60 text-gray-800" : "bg-gray-50 text-gray-400"}`}>
              {f.on ? <Check className="h-4 w-4 shrink-0 text-brand-500" /> : <Lock className="h-4 w-4 shrink-0" />}
              {f.label}
            </li>
          ))}
        </ul>
      </section>

      {/* Billing details */}
      <section className="mt-6 rounded-3xl bg-white p-6 ring-1 ring-gray-200 sm:p-8">
        <h2 className="text-lg font-bold text-gray-900">Billing details</h2>
        <dl className="mt-5 grid grid-cols-1 gap-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-gray-500">Payment method</dt>
            <dd className="mt-1 font-semibold text-gray-900">{sub.paymentMethod || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Last payment</dt>
            <dd className="mt-1 font-semibold text-gray-900">₵{sub.price.toLocaleString()} · {sub.paymentStatus === "paid" ? formatDate(sub.paidAt || sub.startDate) : sub.paymentStatus}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Reference</dt>
            <dd className="mt-1 font-mono font-semibold break-all text-gray-900">{sub.reference}</dd>
          </div>
        </dl>
      </section>


    </>
  );
};

export default Subscription;
