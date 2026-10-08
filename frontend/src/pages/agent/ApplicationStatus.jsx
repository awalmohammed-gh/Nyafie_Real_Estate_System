import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useApiQuery } from "../../hooks/useApiQuery";
import { agentApplicationApi } from "../../frontApi";
import PageLoader from "../../components/ui/PageLoader";
import StatusBadge from "../../components/ui/StatusBadge";
import OnboardingProgress from "../../components/agent/OnboardingProgress";
import { ErrorState } from "../../components/dashboard/States";
import { formatDate } from "../../utils/date";

// What each onboarding step means for the agent, and the one thing to do next
const STEPS = {
  profile: { icon: Clock3, title: "Complete your agent profile", text: "Tell customers about your work. You’ll choose a subscription plan next.", action: { label: "Complete agent profile", to: "/agent/onboarding/profile" } },
  subscription: { icon: Clock3, title: "Choose a subscription plan", text: "Your profile is saved. An active subscription is required before your application is reviewed and your dashboard opens.", action: { label: "Choose plan", to: "/agent/onboarding/subscription" } },
  payment_pending: { icon: Clock3, title: "Payment Pending", text: "We are waiting for confirmation of your subscription payment. Your dashboard stays locked until Paystack confirms it.", action: "recheck" },
  payment_failed: { icon: AlertCircle, title: "Payment not completed", text: "Your last payment didn’t go through. Your account and profile are saved, so you can try again without starting over.", action: { label: "Try payment again", to: "/agent/onboarding/subscription" } },
  review: { icon: Clock3, title: "Your application is under review", text: "Your profile and subscription are complete. Our team is reviewing your application, and we’ll notify you as soon as it’s approved.", action: "refresh" },
  rejected: { icon: AlertCircle, title: "Your application was not approved", text: "Review the feedback below, update your profile and we’ll look at it again. Your subscription and payment are kept.", action: { label: "Update application", to: "/agent/onboarding/profile" } },
  suspended: { icon: ShieldAlert, title: "Your agent account is suspended", text: "Dashboard access is blocked until an admin reactivates your account. Please contact support.", action: { label: "Contact support", to: "/contact" } },
  complete: { icon: ShieldCheck, title: "You’re all set", text: "Your agent account is approved. Add your first property from the dashboard.", action: { label: "Go to Dashboard", to: "/agent/dashboard" } },
};

const LABELS = {
  profile: { complete: ["Complete", "green"], incomplete: ["Incomplete", "gray"] },
  payment: { paid: ["Paid", "green"], waived: ["Waived", "gray"], pending: ["Pending", "amber"], failed: ["Failed", "red"], none: ["Not started", "gray"], not_required: ["Not required", "gray"] },
  subscription: { active: ["Active", "green"], pending: ["Pending", "amber"], expired: ["Expired", "red"], cancelled: ["Cancelled", "gray"], none: ["Not started", "gray"], not_required: ["Not required", "gray"] },
  application: { incomplete: ["Not submitted", "gray"], pending: ["Pending review", "amber"], approved: ["Approved", "green"], rejected: ["Rejected", "red"], suspended: ["Suspended", "red"] },
};

const ApplicationStatus = () => {
  const { user, refreshUser } = useAuth();
  // Loading this page also re-checks an unfinished payment with Paystack on the server
  const query = useApiQuery(`application:${user.id}:${user.agentApplication?.status}:${user.status}`, agentApplicationApi.getApplication);
  const [busy, setBusy] = useState(false);
  const fresh = query.data?.user;

  // Keep the signed-in session in step with what the server just reported (guards use it)
  useEffect(() => {
    if (fresh?.onboarding && fresh.onboarding.step !== user.onboarding?.step) refreshUser().catch(() => {});
  }, [fresh, user.onboarding?.step, refreshUser]);

  if (query.error) return <div className="container-page py-12"><ErrorState message={query.error} onRetry={query.reload} /></div>;
  if (!fresh) return <PageLoader label="Loading your onboarding status..." />;

  const onboarding = fresh.onboarding || {};
  const step = STEPS[onboarding.step] || STEPS.review;
  const Icon = step.icon;
  const recheck = async () => {
    setBusy(true);
    try { await refreshUser(); await query.reload(); } finally { setBusy(false); }
  };
  const retryTo = onboarding.planId ? `${step.action?.to}?plan=${onboarding.planId}` : step.action?.to;
  const rows = [
    { key: "profile", label: "Profile", value: onboarding.profile },
    { key: "payment", label: "Payment", value: onboarding.payment },
    { key: "subscription", label: "Subscription", value: onboarding.subscription, note: onboarding.expiresAt ? `Until ${formatDate(onboarding.expiresAt)}` : "" },
    { key: "application", label: "Application", value: onboarding.application, note: fresh.agentApplication?.submittedAt && onboarding.application === "pending" ? `Submitted ${formatDate(fresh.agentApplication.submittedAt)}` : "" },
  ];

  return (
    <div className="bg-gray-50 py-10 sm:py-14">
      <div className="mx-auto max-w-3xl px-4">
        <OnboardingProgress onboarding={onboarding} className="mb-6" />
        <div className="workspace-card p-6 sm:p-10">
          <p className="workspace-eyebrow mb-6">Your application · {fresh.firstName} {fresh.lastName}</p>
          <span className={`mb-6 grid h-14 w-14 place-items-center rounded-2xl ${onboarding.step === "payment_failed" || onboarding.step === "rejected" || onboarding.step === "suspended" ? "bg-red-50 text-red-600" : onboarding.step === "complete" ? "bg-emerald-50 text-emerald-600" : "bg-brand-50 text-brand-700"}`}>
            <Icon className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">{step.title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">{onboarding.step === "profile" && !onboarding.requireSubscription ? "Complete your professional details to submit your application for review. A subscription is not currently required." : step.text}</p>

          {onboarding.step === "rejected" && fresh.agentApplication?.rejectionReason && (
            <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">Review feedback</p><p className="mt-2 whitespace-pre-wrap">{fresh.agentApplication.rejectionReason}</p></div>
          )}

          <dl className="mt-7 divide-y divide-gray-100 border-y border-gray-100">
            {rows.map(({ key, label, value, note }) => {
              const [text, tone] = LABELS[key][value] || ["Unknown", "gray"];
              return (
                <div key={key} className="flex items-center justify-between gap-4 py-3.5">
                  <dt className="flex items-center gap-3 text-sm font-medium text-gray-700">
                    <CheckCircle2 className={`h-5 w-5 shrink-0 ${tone === "green" ? "text-emerald-500" : "text-gray-300"}`} aria-hidden="true" />
                    {label}
                  </dt>
                  <dd className="flex flex-wrap items-center justify-end gap-2 text-right">
                    {note && <span className="text-xs text-gray-500">{note}</span>}
                    <StatusBadge status={text} tone={tone} />
                  </dd>
                </div>
              );
            })}
          </dl>

          <div className="mt-7 flex flex-wrap gap-3">
            {step.action === "recheck" || step.action === "refresh" ? (
              <button type="button" onClick={recheck} disabled={busy} className="btn btn-primary">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {step.action === "recheck" ? "Check payment status" : "Refresh status"}
              </button>
            ) : (
              <>
                <Link to={onboarding.step === "payment_failed" ? retryTo : step.action.to} className="btn btn-primary">{step.action.label}<ArrowRight className="h-4 w-4" /></Link>
                {onboarding.step !== "complete" && (
                  <button type="button" onClick={recheck} disabled={busy} className="btn btn-light">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh status
                  </button>
                )}
              </>
            )}
            {onboarding.step === "payment_pending" && <Link to="/agent/onboarding/subscription" className="btn btn-light">Choose a different plan</Link>}
          </div>
        </div>
        <p className="mt-5 text-center text-xs leading-relaxed text-gray-500">Your dashboard opens after your profile{onboarding.requireSubscription ? ", required subscription payment," : ""} and admin approval are complete.</p>
      </div>
    </div>
  );
};

export default ApplicationStatus;
