import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowLeft, Check, CreditCard, Loader2, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { durationLabel } from "../../data/plans";
import { usePlatform } from "../../context/usePlatform";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import { addDays, formatDate } from "../../utils/date";
import { getSubscriptionState } from "../../utils/subscription";
import { subscriptionApi } from "../../frontApi";
import PageLoader from "../../components/ui/PageLoader";

const steps = ["Choose plan", "Payment", "Agent account"];

const networks = ["MTN MoMo", "Telecel Cash", "AirtelTigo Money"];

// Test payment mode only: this number/card simulates a declined payment
const DECLINE_MOMO = "0000000000";
const DECLINE_CARD = "4000000000000002";

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

const RETURN_KEY = "homebase:checkout";

const Checkout = () => {
  const [searchParams] = useSearchParams();
  const { getPlan, plansLoading } = usePlatform();
  const plan = getPlan(searchParams.get("plan"));
  // Paystack sends the user back here with ?reference=... after paying
  const returnReference = searchParams.get("reference") || searchParams.get("trxref");
  const { user, isAdmin, refreshUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [method, setMethod] = useState("momo");
  const [momo, setMomo] = useState({ network: networks[0], number: user?.phone?.replace(/\D/g, "").replace(/^233/, "0") || "" });
  const [card, setCard] = useState({ name: user?.name || "", number: "", expiry: "", cvc: "" });
  const [status, setStatus] = useState(returnReference ? "verifying" : "idle"); // idle | processing | verifying | success | error
  const [error, setError] = useState("");
  const [subscription, setSubscription] = useState(null);
  const [paymentMode, setPaymentMode] = useState(null); // "paystack" | "test" | "disabled"
  const timers = useRef([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    subscriptionApi
      .getCurrentSubscription()
      .then((data) => setPaymentMode(data.paymentMode))
      .catch(() => setPaymentMode("test"));
  }, []);

  // The subscription and the agent role always come from the server after it verified the payment
  const finish = async (wasRenewal) => {
    const fresh = await refreshUser();
    setSubscription({ ...fresh?.subscription, wasRenewal });
    setStatus("success");
    toast({
      title: wasRenewal ? "Subscription renewed" : "You are now a HomeBase agent!",
      description: fresh?.subscription ? `${fresh.subscription.planName} plan active until ${formatDate(fresh.subscription.expiryDate)}.` : undefined,
    });
    timers.current.push(setTimeout(() => navigate("/agent/dashboard"), 2600));
  };

  // Returning from Paystack: ask the backend to verify the transaction
  useEffect(() => {
    if (!returnReference) return;
    let saved = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(RETURN_KEY)) || {};
    } catch {
      saved = {};
    }
    subscriptionApi
      .verifyPayment(returnReference)
      .then(() => {
        sessionStorage.removeItem(RETURN_KEY);
        return finish(saved.reference === returnReference && saved.wasRenewal);
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
      });
    // Runs once for the returned reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnReference]);

  if (isAdmin) return <Navigate to="/admin/plans" replace />;

  if (returnReference && status !== "success") {
    return (
      <div className="grid min-h-[70vh] place-items-center bg-gray-50 px-4 py-16">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
          {status === "error" ? (
            <>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-50">
                <AlertCircle className="h-8 w-8 text-red-500" />
              </span>
              <h1 className="mt-5 text-xl font-bold text-gray-900">Payment not confirmed</h1>
              <p className="mt-2 text-sm text-gray-600">{error}</p>
              <Link to="/agent/plans" className="btn btn-primary mt-6">Back to plans</Link>
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
  if (!returnReference && (!plan || (!plan.active && plan.id !== user?.subscription?.planId))) return <Navigate to="/agent/plans" replace />;

  const current = user?.subscription;
  const currentState = getSubscriptionState(current);
  const isRenewal = Boolean(plan) && currentState.isActive && current?.planId === plan.id;
  const startDate = isRenewal ? current.startDate : new Date().toISOString();
  const expiryDate = plan ? addDays(isRenewal ? current.expiryDate : new Date(), plan.durationDays) : null;
  const usingPaystack = paymentMode === "paystack";

  const formatCardNumber = (value) => value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
  const formatExpiry = (value) => value.replace(/\D/g, "").slice(0, 4).replace(/(\d{2})(\d)/, "$1/$2");

  const validate = () => {
    if (method === "momo") {
      if (!/^0\d{9}$/.test(momo.number)) return "Enter a valid 10-digit mobile money number (e.g. 0241234567).";
    } else {
      if (!card.name.trim()) return "Enter the name on the card.";
      if (card.number.replace(/\s/g, "").length !== 16) return "Enter a valid 16-digit card number.";
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry)) return "Enter the expiry date as MM/YY.";
      if (!/^\d{3,4}$/.test(card.cvc)) return "Enter the 3-digit security code.";
    }
    return "";
  };

  const handlePay = async (e) => {
    e.preventDefault();
    if (!usingPaystack) {
      const problem = validate();
      if (problem) {
        setError(problem);
        setStatus("error");
        return;
      }
    }
    setError("");
    setStatus("processing");
    try {
      const init = await subscriptionApi.initializePayment(plan.id, usingPaystack ? "Paystack" : method === "momo" ? momo.network : "Card");
      if (init.mode === "paystack") {
        // Pay on Paystack; the backend verifies the transaction when the user returns
        sessionStorage.setItem(RETURN_KEY, JSON.stringify({ reference: init.reference, wasRenewal: isRenewal }));
        window.location.assign(init.authorizationUrl);
        return;
      }
      // Test mode (no Paystack key on the server): these details simulate a declined payment
      const declined =
        (method === "momo" && momo.number === DECLINE_MOMO) || (method === "card" && card.number.replace(/\s/g, "") === DECLINE_CARD);
      await subscriptionApi.verifyPayment(init.reference, declined ? { simulate: "decline" } : {});
      await finish(isRenewal);
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
          className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl sm:p-10"
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
            {subscription.wasRenewal ? "Subscription renewed" : "Welcome aboard, agent!"}
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
          <Link to="/agent/dashboard" className="btn btn-primary mt-8 w-full">
            Go to your dashboard
          </Link>
          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Taking you to your dashboard...
          </p>
        </motion.div>
      </div>
    );
  }

  const processing = status === "processing";

  return (
    <div className="bg-gray-50 py-10 sm:py-14">
      <div className="container-page">
        <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <Link to={`/agent/plans?plan=${plan.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-brand-600">
            <ArrowLeft className="h-4 w-4" />
            Back to plans
          </Link>
          <Stepper current={1} />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* Payment */}
          <form onSubmit={handlePay} className="rounded-3xl bg-white p-6 ring-1 ring-gray-200 sm:p-8 lg:col-span-3" noValidate>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Payment details</h1>
            <p className="mt-1 text-sm text-gray-500">{usingPaystack ? "Secure payment powered by Paystack." : "Choose how you would like to pay for your subscription."}</p>

            {usingPaystack ? (
              <div className="mt-6 flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-100">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                <span>You will be taken to Paystack to pay securely with mobile money or card. Your agent account activates as soon as HomeBase confirms the payment.</span>
              </div>
            ) : (
              <>
            <div role="radiogroup" aria-label="Payment method" className="mt-6 grid grid-cols-2 gap-3">
              {[
                { id: "momo", label: "Mobile Money", icon: Smartphone },
                { id: "card", label: "Debit / Credit Card", icon: CreditCard },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={method === option.id}
                  onClick={() => {
                    setMethod(option.id);
                    setStatus("idle");
                    setError("");
                  }}
                  className={`flex flex-col items-start gap-3 rounded-2xl p-4 text-left text-sm font-semibold ring-1 transition sm:flex-row sm:items-center ${
                    method === option.id ? "bg-brand-50 text-brand-800 ring-2 ring-brand-500" : "text-gray-700 ring-gray-200 hover:ring-gray-300"
                  }`}
                >
                  <option.icon className={`h-5 w-5 ${method === option.id ? "text-brand-500" : "text-gray-400"}`} />
                  {option.label}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={method}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="mt-6 space-y-4"
              >
                {method === "momo" ? (
                  <>
                    <div>
                      <label htmlFor="network" className="mb-1.5 block text-sm font-medium text-gray-700">Network</label>
                      <select id="network" value={momo.network} onChange={(e) => setMomo((p) => ({ ...p, network: e.target.value }))} className="field">
                        {networks.map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="momo-number" className="mb-1.5 block text-sm font-medium text-gray-700">Mobile money number</label>
                      <input
                        id="momo-number"
                        inputMode="numeric"
                        value={momo.number}
                        onChange={(e) => setMomo((p) => ({ ...p, number: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                        placeholder="0241234567"
                        className="field"
                      />
                      <p className="mt-1.5 text-xs text-gray-500">You'd normally approve the payment prompt on your phone.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label htmlFor="card-name" className="mb-1.5 block text-sm font-medium text-gray-700">Name on card</label>
                      <input id="card-name" autoComplete="cc-name" value={card.name} onChange={(e) => setCard((p) => ({ ...p, name: e.target.value }))} className="field" />
                    </div>
                    <div>
                      <label htmlFor="card-number" className="mb-1.5 block text-sm font-medium text-gray-700">Card number</label>
                      <input
                        id="card-number"
                        inputMode="numeric"
                        autoComplete="cc-number"
                        value={card.number}
                        onChange={(e) => setCard((p) => ({ ...p, number: formatCardNumber(e.target.value) }))}
                        placeholder="4242 4242 4242 4242"
                        className="field"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="card-expiry" className="mb-1.5 block text-sm font-medium text-gray-700">Expiry</label>
                        <input id="card-expiry" inputMode="numeric" autoComplete="cc-exp" value={card.expiry} onChange={(e) => setCard((p) => ({ ...p, expiry: formatExpiry(e.target.value) }))} placeholder="MM/YY" className="field" />
                      </div>
                      <div>
                        <label htmlFor="card-cvc" className="mb-1.5 block text-sm font-medium text-gray-700">CVC</label>
                        <input id="card-cvc" inputMode="numeric" autoComplete="cc-csc" value={card.cvc} onChange={(e) => setCard((p) => ({ ...p, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="123" className="field" />
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
              </>
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

            <button type="submit" disabled={processing} className="btn btn-primary mt-6 w-full py-4 text-base">
              {processing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Confirming payment...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Pay ₵{plan.price.toLocaleString()}{usingPaystack ? " with Paystack" : ""}
                </>
              )}
            </button>

            {paymentMode === "test" && (
            <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-500">
              Test mode (no Paystack key on the server): no real payment is taken. Use {DECLINE_MOMO} or card {DECLINE_CARD.replace(/(\d{4})/g, "$1 ").trim()} to see a declined payment.
            </p>
            )}
          </form>

          {/* Summary */}
          <aside className="lg:col-span-2">
            <div className="rounded-3xl bg-white p-6 ring-1 ring-gray-200 sm:p-8 lg:sticky lg:top-28">
              <h2 className="text-lg font-bold text-gray-900">Order summary</h2>
              <div className="mt-5 rounded-2xl bg-linear-to-br from-brand-500 to-brand-800 p-5 text-white">
                <p className="text-sm text-brand-100">{isRenewal ? "Renewal" : "Agent subscription"}</p>
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
                <div className="flex justify-between gap-4 border-t border-gray-100 pt-3 text-base">
                  <dt className="font-semibold text-gray-900">Total</dt>
                  <dd className="font-extrabold text-gray-900">₵{plan.price.toLocaleString()}</dd>
                </div>
              </dl>
              <p className="mt-6 flex items-start gap-2 text-xs text-gray-500">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                Your account becomes an agent account only after the payment is confirmed.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
