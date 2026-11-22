import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { AlertCircle, ArrowLeft, Check, Clock3, Loader2, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { durationLabel } from "../../data/plans";
import { usePlatform } from "../../context/usePlatform";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import { addDays, formatDate } from "../../utils/date";
import { CHECKOUT_RETURN_KEY as RETURN_KEY, getSubscriptionState } from "../../utils/subscription";
import { subscriptionApi } from "../../frontApi";
import { useApiQuery } from "../../hooks/useApiQuery";
import PageLoader from "../../components/ui/PageLoader";
import { canAccessAgent } from "../../utils/sessionDomain";
import OnboardingProgress from "../../components/agent/OnboardingProgress";
import { adminPath } from "../../utils/adminEntry";

// Renewals and upgrades from the dashboard (new agents see the onboarding progress instead)
const steps = ["Choose plan", "Payment", "Confirmed"];

const Stepper = ({ current }) => (
  <ol className="flex items-center gap-2 sm:gap-4">
    {steps.map((step, index) => {
      const done = index < current;
      const active = index === current;
      return (
        <li key={step} className="flex items-center gap-2 sm:gap-4">
          <span className="flex items-center gap-2">
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors ${
                done ? "bg-brand-500 text-white" : active ? "bg-brand-50 text-brand-700 ring-2 ring-brand-500" : "bg-gray-100 text-gray-400"
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            <span className={`hidden text-sm font-semibold sm:inline ${active || done ? "text-gray-900" : "text-gray-400"}`}>{step}</span>
          </span>
          {index < steps.length - 1 && <span className={`h-px w-6 sm:w-10 ${done ? "bg-brand-500" : "bg-gray-200"}`} />}
        </li>
      );
    })}
  </ol>
);

const Checkout = () => {
  const [searchParams] = useSearchParams();
  const { getPlan, plansLoading, siteName } = usePlatform();
  const plan = getPlan(searchParams.get("plan"));
  // Paystack sends the user back here with ?reference=... after paying
  const returnReference = searchParams.get("reference") || searchParams.get("trxref");
  const { user, isAdmin, refreshUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const plansPath = canAccessAgent(user) ? "/agent/subscription/plans" : "/agent/onboarding/subscription";
  const [status, setStatus] = useState(returnReference ? "verifying" : "idle"); // idle | processing | verifying | pending | success | error
  const [error, setError] = useState("");
  const [subscription, setSubscription] = useState(null);
  const [paymentMode, setPaymentMode] = useState(null); // "paystack" | "disabled" (from the server)
  const timers = useRef([]);

  // What this plan costs now always comes from the server: credit for the current plan, amount due and dates
  const quoteKey = plan && !returnReference && user?.role === "agent" ? `quote:${plan.id}:${user.subscription?.id || "none"}` : null;
  const quote = useApiQuery(quoteKey || "quote:none", () => (quoteKey ? subscriptionApi.quotePlan(plan.id) : Promise.resolve(null)));
  const due = quote.data;

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    subscriptionApi
      .getCurrentSubscription()
      .then((data) => setPaymentMode(data.paymentMode))
      .catch(() => setPaymentMode("disabled"));
  }, []);

  // The subscription and the agent role always come from the server after it verified the payment
  // kind: "renewal" | "upgrade" | undefined (a new subscription)
  const finish = async (fresh, kind) => {
    await refreshUser();
    const approved = canAccessAgent(fresh);
    const needsProfile = fresh?.onboarding?.step === "profile";
    const nextPath = needsProfile ? "/agent/onboarding/profile" : approved ? "/agent/dashboard" : "/agent/status";
    const title = kind === "upgrade" ? "Plan upgraded" : kind === "renewal" ? "Subscription renewed" : "Payment confirmed";
    setSubscription({ ...fresh?.subscription, title, approved, needsProfile, nextPath });
    setStatus("success");
    toast({
      title,
      description: fresh?.subscription ? `${fresh.subscription.planName} plan active until ${formatDate(fresh.subscription.expiryDate)}.` : undefined,
    });
    timers.current.push(setTimeout(() => navigate(nextPath, { replace: true }), 2600));
  };

  // Returning from Paystack: only the backend decides (it asks Paystack) whether the payment went through
  const verify = () => {
    let saved = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(RETURN_KEY)) || {};
    } catch {
      saved = {};
    }
    setStatus("verifying");
    return subscriptionApi
      .verifyPayment(returnReference)
      .then((fresh) => {
        if (fresh?.pending) return setStatus("pending");
        sessionStorage.removeItem(RETURN_KEY);
        const ours = saved.reference === returnReference;
        return finish(fresh, ours && saved.wasUpgrade ? "upgrade" : ours && saved.wasRenewal ? "renewal" : undefined);
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
        refreshUser().catch(() => {});
      });
  };
  useEffect(() => {
    if (returnReference) verify();
    // Runs once for the returned reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnReference]);

  if (isAdmin) return <Navigate to={adminPath("/plans")} replace />;

  if (returnReference && status !== "success") {
    return (
      <div className="grid min-h-[70vh] place-items-center bg-gray-50 px-4 py-16">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          {status === "error" ? (
            <>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-50">
                <AlertCircle className="h-8 w-8 text-red-500" />
              </span>
              <h1 className="mt-5 text-xl font-bold text-gray-900">Payment not completed</h1>
              <p className="mt-2 text-sm text-gray-600">{error}</p>
              <Link to={user?.onboarding?.planId ? `${plansPath}?plan=${user.onboarding.planId}` : plansPath} className="btn btn-primary mt-6">Try payment again</Link>
              {!canAccessAgent(user) && <Link to="/agent/status" className="mt-4 block text-sm font-semibold text-brand-700">View onboarding status</Link>}
            </>
          ) : status === "pending" ? (
            <>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-50">
                <Clock3 className="h-8 w-8 text-amber-500" />
              </span>
              <h1 className="mt-5 text-xl font-bold text-gray-900">Payment Pending</h1>
              <p className="mt-2 text-sm text-gray-600">We are waiting for confirmation of your subscription payment. If you approved a mobile money prompt, this can take a minute.</p>
              <button type="button" onClick={verify} className="btn btn-primary mt-6"><RefreshCw className="h-4 w-4" />Check again</button>
              {!canAccessAgent(user) && <Link to="/agent/status" className="mt-4 block text-sm font-semibold text-brand-700">View onboarding status</Link>}
            </>
          ) : (
            <>
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand-500" />
              <h1 className="mt-5 text-xl font-bold text-gray-900">Confirming your payment...</h1>
              <p className="mt-2 text-sm text-gray-600">Please keep this page open. This only takes a moment.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!returnReference && plansLoading) return <PageLoader label="Loading plan..." />;

  // Only active plans can be bought (an existing subscriber may renew their current plan)
  if (!returnReference && (!plan || (!plan.active && plan.id !== user?.subscription?.planId))) return <Navigate to={plansPath} replace />;

  const current = user?.subscription;
  const currentState = getSubscriptionState(current);
  const isRenewal = due ? due.kind === "renewal" : Boolean(plan) && currentState.isActive && current?.planId === plan.id;
  const startDate = due?.startsAt || (isRenewal ? current.startDate : new Date().toISOString());
  const expiryDate = due?.expiresAt || (plan ? addDays(isRenewal ? current.expiryDate : new Date(), plan.durationDays) : null);
  const amountDue = due?.amount ?? null;
  const isUpgrade = due?.kind === "upgrade";
  const summaryLabel = isUpgrade ? `Upgrade from ${due.currentPlan?.name}` : isRenewal ? "Renewal" : "Agent subscription";
  // Active subscribers came from their subscription page (renewals and upgrades); others from the plans list
  const backTo = canAccessAgent(user) && currentState.isActive ? { to: isUpgrade ? "/agent/subscription/upgrade" : "/agent/subscription", label: isUpgrade ? "Back to upgrades" : "Back to subscription" } : { to: plan ? `${plansPath}?plan=${plan.id}` : plansPath, label: "Back to plans" };
  const paymentsDisabled = paymentMode === "disabled";

  // Payment happens on Paystack; the backend verifies the transaction when the user returns
  const handlePay = async (e) => {
    e.preventDefault();
    setError("");
    setStatus("processing");
    try {
      const init = await subscriptionApi.initializePayment(plan.id, "Paystack");
      // The credit covered the whole upgrade: the server has already switched the plan
      if (init.mode === "credit") return finish(init.user, "upgrade");
      sessionStorage.setItem(RETURN_KEY, JSON.stringify({ reference: init.reference, wasRenewal: isRenewal, wasUpgrade: isUpgrade }));
      window.location.assign(init.authorizationUrl);
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  };

  if (status === "success" && subscription) {
    return (
      <div className="grid min-h-[75vh] place-items-center bg-gray-50 px-4 py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", damping: 24, stiffness: 260 }}
          className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl sm:p-10"
        >
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 15 }}
            className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-50"
          >
            <Check className="h-10 w-10 text-emerald-500" strokeWidth={3} />
          </motion.span>
          <h1 className="mt-6 text-2xl font-extrabold text-gray-900">
            {subscription.title}
          </h1>
          <p className="mt-2 text-gray-600">
            Your <span className="font-semibold text-gray-900">{subscription.planName}</span> plan is active until{" "}
            {formatDate(subscription.expiryDate)}.
          </p>
          <dl className="mt-6 grid grid-cols-2 gap-3 rounded-2xl bg-gray-50 p-4 text-left text-sm">
            <div>
              <dt className="text-gray-500">Reference</dt>
              <dd className="font-semibold text-gray-900">{subscription.reference}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Amount paid</dt>
              <dd className="font-semibold text-gray-900">₵{subscription.price.toLocaleString()}</dd>
            </div>
          </dl>
          {!subscription.approved && <p className="mt-4 text-sm leading-relaxed text-gray-600">{subscription.needsProfile ? "Payment confirmed. Complete your remaining agent details using your existing account, then submit your profile for admin review." : "Your application remains under review. Dashboard access begins after admin approval."}</p>}
          <Link to={subscription.nextPath} className="btn btn-primary mt-8 w-full">
            {subscription.needsProfile ? "Complete your agent profile" : subscription.approved ? "Go to your dashboard" : "View application status"}
          </Link>
          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {subscription.needsProfile ? "Opening your agent profile..." : subscription.approved ? "Taking you to your dashboard..." : "Taking you to your application status..."}
          </p>
        </motion.div>
      </div>
    );
  }

  const processing = status === "processing";

  return (
    <div className={canAccessAgent(user) ? "py-2" : "py-8 sm:py-12"}>
      <div className={canAccessAgent(user) ? "w-full" : "container-page max-w-6xl"}>
        <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <Link to={backTo.to} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-brand-600">
            <ArrowLeft className="h-4 w-4" />
            {backTo.label}
          </Link>
          {canAccessAgent(user) ? <Stepper current={1} /> : <OnboardingProgress onboarding={user?.onboarding} />}
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* Payment */}
          <form onSubmit={handlePay} className="rounded-2xl bg-white p-6 ring-1 ring-gray-200 sm:p-8 lg:col-span-3" noValidate>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Payment details</h1>
            <p className="mt-1 text-sm text-gray-500">Secure payment powered by Paystack.</p>

            {paymentsDisabled ? (
              <div className="mt-6 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-100">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <span>Online payments are not available right now. Please try again later or contact {siteName}.</span>
              </div>
            ) : (
              <div className="mt-6 flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-100">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                <span>You will be taken to Paystack to pay securely with mobile money or card. Your subscription starts only after we confirm the payment with Paystack.{!user?.agentApplication?.profileCompletedAt ? " After payment, complete your agent profile with this same account." : !canAccessAgent(user) && user?.onboarding?.application !== "approved" ? " Your application then goes to our team for review." : ""}</span>
              </div>
            )}

            {quote.error && (
              <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {quote.error}
              </p>
            )}
            {isUpgrade && (
              <p className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">Your upgrade starts as soon as the payment is confirmed. Your listings, team and history stay as they are, and the new limits apply straight away.</p>
            )}

            {status === "error" && (
              <motion.p
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </motion.p>
            )}

            <button type="submit" disabled={processing || amountDue === null || (amountDue > 0 && (paymentsDisabled || !paymentMode))} className="btn btn-primary mt-6 w-full py-4 text-base">
              {processing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Opening Paystack...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  {amountDue === null ? (quote.loading ? "Calculating your price..." : "Price unavailable") : amountDue > 0 ? `Complete payment · ₵${amountDue.toLocaleString()}` : "Upgrade · nothing to pay"}
                </>
              )}
            </button>

          </form>

          {/* Summary */}
          <aside className="lg:col-span-2">
            <div className="rounded-2xl bg-white p-6 ring-1 ring-gray-200 sm:p-8 lg:sticky lg:top-28">
              <h2 className="text-lg font-bold text-gray-900">Order summary</h2>
              <div className="mt-5 rounded-2xl bg-linear-to-br from-brand-500 to-brand-800 p-5 text-white">
                <p className="text-sm text-brand-100">{summaryLabel}</p>
                <p className="mt-1 text-2xl font-extrabold">{plan.name}</p>
                <p className="text-sm text-brand-100">{durationLabel(plan.durationDays)} · {plan.propertyLimit} listings · {plan.imageLimit} photos each</p>
              </div>
              <dl className="mt-6 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Account</dt>
                  <dd className="truncate font-medium text-gray-900">{user?.email}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Starts</dt>
                  <dd className="font-medium text-gray-900">{formatDate(startDate)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Expires</dt>
                  <dd className="font-medium text-gray-900">{formatDate(expiryDate)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Plan price</dt>
                  <dd className="font-medium text-gray-900">₵{plan.price.toLocaleString()}</dd>
                </div>
                {due?.credit > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Credit for {due.currentPlan?.name} <span className="block text-xs">{due.remainingDays} {due.remainingDays === 1 ? "day" : "days"} left</span></dt>
                    <dd className="font-medium text-emerald-700">−₵{due.credit.toLocaleString()}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t border-gray-100 pt-3 text-base">
                  <dt className="font-semibold text-gray-900">Total due</dt>
                  <dd className="font-extrabold text-gray-900">{amountDue === null ? "…" : `₵${amountDue.toLocaleString()}`}</dd>
                </div>
              </dl>
              <p className="mt-6 flex items-start gap-2 text-xs text-gray-500">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                Payment does not approve your agent application. Admin review is a separate step.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
