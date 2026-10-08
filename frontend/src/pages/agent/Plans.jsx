import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  Inbox,
  Info,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { durationLabel, planFeatureList } from "../../data/plans";
import { usePlatform } from "../../context/usePlatform";
import PageLoader from "../../components/ui/PageLoader";
import { useAuth } from "../../context/useAuth";
import Reveal from "../../components/ui/Reveal";
import StatusBadge from "../../components/ui/StatusBadge";
import { formatDate } from "../../utils/date";
import { canAccessAgent } from "../../utils/sessionDomain";
import OnboardingProgress from "../../components/agent/OnboardingProgress";
import PageTitle from "../../components/agent/PageTitle";
import EmptyState from "../../components/ui/EmptyState";

const benefits = [
  { icon: Users, title: "Reach serious buyers", text: "Put your listings in front of buyers and renters searching across Ghana." },
  { icon: Megaphone, title: "Your own agent profile", text: "A public profile that showcases your listings, service areas and contact details." },
  { icon: Inbox, title: "Inquiries in one place", text: "Every message about your properties lands in a single inbox you can track and close." },
  { icon: BarChart3, title: "See what performs", text: "Track views and inquiries per listing so you know where to focus." },
];

const capabilities = [
  "List properties for sale or rent with photos",
  "Save drafts and publish when you're ready",
  "Edit prices, availability and details anytime",
  "Manage and respond to buyer inquiries",
  "Monitor views across all your listings",
  "Renew or upgrade your plan as you grow",
];

const faqs = [
  { q: "When can I access the agent dashboard?", a: "Complete your agent profile and any required subscription payment, then wait for admin approval. Payment alone does not grant dashboard access." },
  { q: "What happens when my plan expires?", a: "Your account and listings stay safe, but listings are hidden from the public and you can't add or edit properties until you renew." },
  { q: "Can I upgrade later?", a: "Yes. Choose a bigger plan at any time; the new plan starts on the day you upgrade." },
];

const Plans = () => {
  const { isAuthenticated, isAgent, isAdmin, user, isActive, isExpired } = useAuth();
  const { plans: allPlans, plansLoading, siteName } = usePlatform();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentPlanId = user?.subscription?.planId;
  // Inactive plans are hidden from new agents, but an existing subscriber can still see and renew theirs
  const plans = allPlans.filter((p) => p.active || p.id === currentPlanId);
  // /agent/onboarding/subscription: step 3 of agent onboarding (focused, no marketing sections)
  const onboardingMode = location.pathname.startsWith("/agent/onboarding");
  const focusedMode = onboardingMode || location.pathname.startsWith("/agent/subscription");
  const [selectedId, setSelectedId] = useState(searchParams.get("plan") || user?.onboarding?.planId || currentPlanId || "professional");
  const selected = plans.find((p) => p.id === selectedId) || plans.find((p) => p.popular) || plans[0];

  if (plansLoading) return <PageLoader label="Loading plans..." />;
  if (!selected) return <EmptyState icon={Building2} title="Plans are currently unavailable" description="Please contact our team for help with your subscription." action={<Link to="/contact" className="btn btn-primary">Contact support</Link>} />;
  if (onboardingMode) {
    if (canAccessAgent(user)) return <Navigate to="/agent/subscription/plans" replace />;
    if (user?.onboarding?.step === "profile") return <Navigate to="/agent/onboarding/profile" replace />;
    if (["review", "rejected", "suspended"].includes(user?.onboarding?.step)) return <Navigate to="/agent/status" replace />;
  }

  const isRenewal = isAgent && selected.id === currentPlanId;
  const ctaLabel = onboardingMode
    ? `Choose ${selected.name}`
    : !isAgent
    ? `Continue with ${selected.name}`
    : isRenewal
      ? `Renew ${selected.name}`
      : `Switch to ${selected.name}`;

  const handleContinue = () => {
    if (isAdmin) {
      navigate("/admin/plans");
      return;
    }
    const target = `${user?.agentApplication?.status === "approved" ? "/agent/subscription/checkout" : "/agent/checkout"}?plan=${selected.id}`;
    if (!isAuthenticated || !isAgent) {
      navigate("/register?account=agent", { state: { from: `/agent/subscription/checkout?plan=${selected.id}` } });
      return;
    }
    if (!user.agentApplication?.profileCompletedAt) { navigate("/agent/onboarding/profile"); return; }
    if (user.status === "suspended" || ["suspended", "rejected"].includes(user.agentApplication?.status) || (user.agentApplication?.status === "pending" && isActive)) { navigate("/agent/status"); return; }
    navigate(target);
  };

  return (
    <>
      {focusedMode && !onboardingMode && <PageTitle title="Find the right plan" eyebrow="Your subscription" description="Compare listing limits and features. Choose the plan that fits your business." action={<Link to="/agent/subscription" className="btn btn-light">Back to subscription</Link>} />}
      {onboardingMode && (
        <section className="border-b border-gray-200 bg-white">
          <div className="container-page py-8 sm:py-10">
            <div className="flex flex-wrap items-center justify-between gap-4"><OnboardingProgress onboarding={user?.onboarding} /><Link to="/agent/status" className="text-sm font-semibold text-brand-700">Onboarding status</Link></div>
            <p className="mt-8 text-xs font-bold tracking-wider text-brand-700 uppercase">Step 3 of 4 · Subscription</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900">Choose your plan.</h1>
            <p className="mt-3 max-w-2xl text-gray-600">Your profile is saved. Pick a plan and pay securely with Paystack. Your dashboard opens once the payment is confirmed{user?.onboarding?.application === "approved" ? "" : " and your application is approved"}.</p>
            {user?.onboarding?.payment === "failed" && <p role="status" className="mt-5 flex max-w-2xl items-start gap-3 rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-800 ring-1 ring-red-100"><Info className="mt-0.5 h-5 w-5 shrink-0" />Your last payment wasn’t completed. Nothing was charged to your plan, and your account and profile are saved. Choose a plan to try again.</p>}
          </div>
        </section>
      )}

      {/* Hero */}
      {!focusedMode && <section className="relative isolate overflow-hidden bg-gray-950">
        <div className="absolute inset-0 -z-10 bg-linear-to-br from-brand-800/70 via-gray-950 to-gray-950" />
        <div className="absolute -top-40 right-0 -z-10 h-[28rem] w-[28rem] rounded-full bg-brand-500/25 blur-3xl" />
        <div className="container-page py-16 text-center sm:py-24">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wider text-brand-200 uppercase ring-1 ring-white/15">
              <Sparkles className="h-4 w-4" />
              {siteName} for Agents
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold tracking-tight text-balance text-white sm:text-5xl lg:text-6xl">
              Grow your real estate business with {siteName}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-pretty text-gray-300 sm:text-lg">
              Become a verified agent, list your properties in front of motivated buyers and renters, and manage every inquiry from one dashboard.
            </p>
            <a href="#plans" className="btn btn-primary mt-8">
              View plans
              <ArrowRight className="h-4 w-4" />
            </a>
          </motion.div>
        </div>
      </section>}

      {location.state?.notice === "agent-only" && (
        <div className="container-page pt-8">
          <p className="flex items-start gap-3 rounded-2xl bg-brand-50 px-5 py-4 text-sm text-brand-800 ring-1 ring-brand-100">
            <Info className="mt-0.5 h-5 w-5 shrink-0" />
            Agent dashboard access requires a completed profile, any required subscription and admin approval.
          </p>
        </div>
      )}

      {/* Why */}
      {!focusedMode && <section className="container-page py-16 sm:py-20">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((benefit, index) => (
            <Reveal key={benefit.title} delay={index * 0.06} className="h-full">
              <div className="h-full rounded-3xl bg-gray-50 p-6">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-brand-500 shadow-sm">
                  <benefit.icon className="h-6 w-6" />
                </span>
                <h2 className="mt-5 font-bold text-gray-900">{benefit.title}</h2>
                <p className="mt-1.5 text-sm text-gray-600">{benefit.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>}

      {/* Plans */}
      <section id="plans" className={`scroll-mt-24 bg-gray-50 ${focusedMode ? "py-6 sm:py-8" : "py-16 sm:py-24"}`}>
        <div className="container-page">
          <div className={`mx-auto mb-12 max-w-2xl text-center ${focusedMode ? "sr-only" : ""}`}>
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">Choose your plan</h2>
            <p className="mt-3 text-gray-600">Simple pricing in Ghana cedis. No setup fees, cancel by simply not renewing.</p>
            {isAgent && user.subscription && (
              <p className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 text-sm text-gray-600">
                Your current plan: <span className="font-semibold text-gray-900">{user.subscription.planName}</span>
                <StatusBadge status={isActive ? "Active" : "Expired"} />
                <span>{isExpired ? "expired" : "renews"} {formatDate(user.subscription.expiryDate)}</span>
              </p>
            )}
          </div>

          <div role="radiogroup" aria-label="Subscription plans" className="workspace-plan-cards grid grid-cols-1 gap-5 lg:grid-cols-3">
            {plans.map((plan) => {
              const isSelected = plan.id === selectedId;
              const isCurrent = plan.id === currentPlanId;
              return (
                <motion.button
                  key={plan.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedId(plan.id)}
                  whileTap={{ scale: 0.99 }}
                  className={`relative flex h-full flex-col rounded-3xl bg-white p-7 text-left transition-shadow sm:p-8 ${
                    isSelected ? "shadow-2xl shadow-brand-500/15" : "shadow-sm ring-1 ring-gray-200 hover:shadow-lg"
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="plan-ring"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      className="pointer-events-none absolute inset-0 rounded-3xl ring-2 ring-brand-500"
                    />
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                    <div className="flex gap-2">
                      {isCurrent && <StatusBadge status="Current plan" tone={isActive ? "green" : "red"} dot={false} />}
                      {plan.popular && !isCurrent && <StatusBadge status="Most popular" tone="brand" dot={false} />}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">{plan.tagline}</p>

                  <p className="mt-6">
                    <span className="text-4xl font-extrabold tracking-tight text-gray-900">₵{plan.price.toLocaleString()}</span>
                    <span className="text-gray-500"> / {durationLabel(plan.durationDays)}</span>
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    ≈ ₵{Math.round(plan.price / (plan.durationDays / 30)).toLocaleString()} per month
                  </p>

                  <div className="mt-6 flex items-center gap-2 rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                    <Building2 className="h-4 w-4 text-brand-500" />
                    <span className="font-semibold text-gray-900">{plan.propertyLimit}</span>
                    <span className="text-gray-600">active listings</span>
                  </div>

                  <p className="mt-3 text-xs text-gray-500">{durationLabel(plan.durationDays)} from the day your payment is confirmed. No automatic charges: renew whenever you’re ready, and renewing early adds the time to your current expiry date.</p>

                  <ul className="mt-6 mb-8 space-y-3">
                    {planFeatureList(plan).map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm text-gray-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <span
                    className={`mt-auto flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition-colors ${
                      isSelected ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="h-4 w-4" />
                        Selected
                      </>
                    ) : (
                      "Select plan"
                    )}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Summary + continue */}
          <div className="workspace-billing-summary mt-8 flex flex-col items-center justify-between gap-5 rounded-3xl bg-white p-6 ring-1 ring-gray-200 sm:flex-row sm:p-8">
            <div className="text-center sm:text-left">
              <p className="text-sm text-gray-500">Selected plan</p>
              <p className="text-lg font-bold text-gray-900">
                {selected.name} · ₵{selected.price.toLocaleString()} for {durationLabel(selected.durationDays)}
              </p>
              {isRenewal && isActive && (
                <p className="text-sm text-gray-500">Renewing adds {selected.durationDays} days to your current expiry date.</p>
              )}
            </div>
            <button onClick={handleContinue} className="btn btn-primary w-full px-8 py-3.5 sm:w-auto">
              {isAdmin ? "Manage plans in admin" : isAuthenticated ? ctaLabel : "Sign in to continue"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Dashboard access begins after your profile, required payment and admin approval are complete.
          </p>
        </div>
      </section>

      {/* What agents can do + FAQ */}
      {!focusedMode && <section className="container-page grid gap-12 py-16 sm:py-24 lg:grid-cols-2">
        <Reveal>
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">What you can do as an agent</h2>
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {capabilities.map((item) => (
              <li key={item} className="flex items-start gap-3 rounded-2xl bg-gray-50 p-4 text-sm font-medium text-gray-800">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">Common questions</h2>
          <div className="mt-6 divide-y divide-gray-100 rounded-3xl ring-1 ring-gray-200">
            {faqs.map((faq) => (
              <details key={faq.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-gray-900">
                  {faq.q}
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-gray-600">{faq.a}</p>
              </details>
            ))}
          </div>
          {isAgent && (
            <Link to="/agent/dashboard" className="btn btn-light mt-6">
              Go to your dashboard
            </Link>
          )}
        </Reveal>
      </section>}
    </>
  );
};

export default Plans;
