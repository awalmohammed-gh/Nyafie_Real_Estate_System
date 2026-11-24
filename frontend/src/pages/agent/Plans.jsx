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
  User as UserIcon,
  Landmark,
} from "lucide-react";
import { ACCOUNT_TYPES, accountTypeOf, durationLabel, planFeatureList, plansFor } from "../../data/plans";
import { usePlatform } from "../../context/usePlatform";
import PageLoader from "../../components/ui/PageLoader";
import { useAuth } from "../../context/useAuth";
import Reveal from "../../components/ui/Reveal";
import StatusBadge from "../../components/ui/StatusBadge";
import { formatDate } from "../../utils/date";
import { agentDestination, canAccessAgent } from "../../utils/sessionDomain";
import { authApi } from "../../frontApi";
import OnboardingProgress from "../../components/agent/OnboardingProgress";
import PageTitle from "../../components/agent/PageTitle";
import EmptyState from "../../components/ui/EmptyState";
import { adminPath } from "../../utils/adminEntry";
import FreeAgentAccess from "../../components/agent/FreeAgentAccess";

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
  { q: "Can I upgrade later?", a: "Yes, to any higher plan for your account type. The unused value of your current plan is credited, so you only pay the difference, and the upgraded plan starts as soon as your payment is confirmed." },
  { q: "What's the difference between individual, agency and company plans?", a: "Individual plans are for independent agents and property owners. Agency plans are for real estate agencies, and company plans for developers, property managers and other registered businesses; both add a team and a company profile. Each account type has its own plans, and you upgrade within your type." },
];

const Plans = () => {
  const { isAuthenticated, isAgent, isAdmin, user, isActive, isExpired, requestPassword } = useAuth();
  const { plans: allPlans, plansLoading, siteName, settings, settingsReady } = usePlatform();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState("");
  const currentPlanId = user?.subscription?.planId;
  // Inactive plans are hidden from new agents, but an existing subscriber can still see and renew theirs
  const available = allPlans.filter((p) => p.active || p.id === currentPlanId);
  // /agent/onboarding/subscription: step 3 of agent onboarding (focused, no marketing sections)
  const onboardingMode = location.pathname.startsWith("/agent/onboarding");
  const focusedMode = onboardingMode || location.pathname.startsWith("/agent/subscription");

  // Plans are shown for one account type at a time. Agents only see plans for their own account type;
  // visitors browse all. (The server enforces the same rule whatever plan id is sent.)
  const existingProvider = isAgent || user?.agentAccess;
  const accountType = existingProvider ? accountTypeOf(user?.agentApplication?.agentType) : "individual";
  const browsableTypes = !existingProvider ? Object.keys(ACCOUNT_TYPES) : [accountType];
  const canBrowseTypes = browsableTypes.length > 1;
  const [viewType, setViewType] = useState(() => (browsableTypes.includes(searchParams.get("type")) ? searchParams.get("type") : accountType));
  const shownType = browsableTypes.includes(viewType) ? viewType : accountType;
  const plans = plansFor(available, shownType);
  // While a plan is active, only higher tiers of the same account type (or a renewal) can be bought
  const currentPlan = allPlans.find((p) => p.id === currentPlanId);
  const onActivePlan = existingProvider && isActive && Boolean(currentPlan);

  // undefined: the suggested plan (the one asked for, the current one, or the most popular); null: none, after unselecting
  const [selectedId, setSelectedId] = useState(() => searchParams.get("plan") || user?.onboarding?.planId || currentPlanId || undefined);
  const selected = selectedId === null ? null : plans.find((p) => p.id === selectedId) || plans.find((p) => p.popular) || plans[0] || null;
  // Clicking the selected plan again unselects it
  const togglePlan = (id) => setSelectedId(selected?.id === id ? null : id);
  const showType = (type) => {
    setViewType(type);
    setSelectedId(undefined);
  };

  // Agency staff work under the agency plan, which the owner manages
  if (!settingsReady) return <PageLoader label="Loading agent access..." />;
  if (!settings.agent.requireSubscription) {
    if (focusedMode) return <Navigate to={canAccessAgent(user) ? "/agent/subscription" : "/agent/status"} replace />;
    return <FreeAgentAccess />;
  }
  if (isAgent && user?.agency && focusedMode) return <Navigate to="/agent/dashboard" replace />;
  // Active subscribers upgrade from the upgrade view, which only lists higher plans
  if (onActivePlan && focusedMode && !onboardingMode) return <Navigate to="/agent/subscription/upgrade" replace />;
  if (plansLoading) return <PageLoader label="Loading plans..." />;
  if (!plans.length && !canBrowseTypes) return <EmptyState icon={Building2} title="Plans are currently unavailable" description="Please contact our team for help with your subscription." action={<Link to="/contact" className="btn btn-primary">Contact support</Link>} />;
  if (onboardingMode) {
    if (canAccessAgent(user)) return <Navigate to="/agent/subscription/plans" replace />;
    if (user?.onboarding?.step === "profile") return <Navigate to="/agent/onboarding/profile" replace />;
    if (["review", "rejected", "suspended"].includes(user?.onboarding?.step)) return <Navigate to="/agent/status" replace />;
  }

  const isRenewal = existingProvider && selected?.id === currentPlanId;
  const isUpgrade = onActivePlan && !isRenewal && selected?.sortOrder > currentPlan.sortOrder;
  const notAnUpgrade = onActivePlan && !isRenewal && !isUpgrade;
  const ctaLabel = !selected
    ? "Choose a plan"
    : onboardingMode
    ? `Choose ${selected.name}`
    : !isAgent
    ? `Continue with ${selected.name}`
    : isRenewal
      ? `Renew ${selected.name}`
      : notAnUpgrade
        ? `Not an upgrade from ${currentPlan.name}`
        : isUpgrade
          ? `Upgrade to ${selected.name}`
          : `Choose ${selected.name}`;

  const handleContinue = async () => {
    if (!selected || notAnUpgrade || continuing) return;
    setContinueError("");
    if (isAdmin) {
      navigate(adminPath("/plans"));
      return;
    }
    const target = `${user?.agentApplication?.status === "approved" ? "/agent/subscription/checkout" : "/agent/checkout"}?plan=${selected.id}`;
    if (!isAuthenticated) {
      navigate("/login", { state: { from: `/agent/plans?plan=${selected.id}&type=${shownType}` } });
      return;
    }
    if (!isAgent) {
      setContinuing(true);
      try {
        // Signed up with Google: the agent area needs a NyaFie password
        if (user.passwordMissing && !(await requestPassword("agent"))) return;
        const agent = await authApi.becomeAgent(selected.id);
        const checkout = `${canAccessAgent(agent) ? "/agent/subscription/checkout" : "/agent/checkout"}?plan=${selected.id}`;
        // Resume an existing payment/profile instead of asking the customer to pay twice.
        const missingPayment = ["none", "failed", "not_required"].includes(agent.onboarding?.payment);
        navigate(!canAccessAgent(agent) && !missingPayment ? agentDestination(agent) : checkout);
      } catch (error) { setContinueError(error.message); }
      finally { setContinuing(false); }
      return;
    }
    if (!user.agentApplication?.profileCompletedAt && !user.customerAccess) { navigate("/agent/onboarding/profile"); return; }
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
            <p className="mt-8 text-xs font-bold tracking-wider text-brand-700 uppercase">Step {user?.onboarding?.paymentFirst ? "2" : "3"} of 4 · Subscription</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900">Choose your plan.</h1>
            <p className="mt-3 max-w-2xl text-gray-600">{user?.onboarding?.paymentFirst && !user?.agentApplication?.profileCompletedAt ? "Choose a plan and pay securely with Paystack. You’ll complete your professional details next, using your existing account. Admin approval is required before your dashboard opens." : `Your profile is saved. Pick a plan and pay securely with Paystack. Your dashboard opens once the payment is confirmed${user?.onboarding?.application === "approved" ? "" : " and your application is approved"}.`}</p>
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

          {canBrowseTypes && !onboardingMode && (
            <div className="mb-8 flex justify-center">
              <div role="tablist" aria-label="Account type" className="no-scrollbar inline-flex max-w-full overflow-x-auto rounded-full bg-white p-1 shadow-sm ring-1 ring-gray-200">
                {browsableTypes.map((type) => [type, ACCOUNT_TYPES[type]]).map(([type, info]) => (
                  <button key={type} type="button" role="tab" aria-selected={shownType === type} onClick={() => showType(type)}
                    className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition sm:px-5 ${shownType === type ? "bg-brand-500 text-white shadow" : "text-gray-600 hover:text-gray-900"}`}>
                    <span className="hidden sm:inline">{type === "individual" ? <UserIcon className="h-4 w-4" aria-hidden="true" /> : type === "company" ? <Landmark className="h-4 w-4" aria-hidden="true" /> : <Building2 className="h-4 w-4" aria-hidden="true" />}</span>
                    <span className="sm:hidden">{info.plural.replace(" plans", "")}</span><span className="hidden sm:inline">{info.plural}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="mx-auto mb-8 max-w-2xl text-center text-sm text-gray-600">{ACCOUNT_TYPES[shownType].description}</p>
          {!plans.length && <EmptyState icon={Building2} title={`No ${ACCOUNT_TYPES[shownType].plural.toLowerCase()} yet`} description="Please check back soon, or contact our team for help choosing a plan." action={<Link to="/contact" className="btn btn-primary">Contact support</Link>} />}

          <div role="group" aria-label={ACCOUNT_TYPES[shownType].plural} className="workspace-plan-cards grid grid-cols-1 gap-5 lg:grid-cols-3">
            {plans.map((plan) => {
              const isSelected = plan.id === selected?.id;
              const isCurrent = plan.id === currentPlanId;
              return (
                <motion.button
                  key={plan.id}
                  type="button"
                  aria-pressed={isSelected}
                  title={isSelected ? "Click again to unselect" : undefined}
                  onClick={() => togglePlan(plan.id)}
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

                  <p className="mt-3 text-xs text-gray-500">{durationLabel(plan.durationDays)} from the day your payment is confirmed. No automatic charges: renewing early adds the time to your current expiry date, and upgrading credits what’s left of your current plan.</p>

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

          {selected && <div className="workspace-billing-summary mt-8 flex flex-col items-center justify-between gap-5 rounded-3xl bg-white p-6 ring-1 ring-gray-200 sm:flex-row sm:p-8">
            <div className="text-center sm:text-left">
              <p className="text-sm text-gray-500">Selected plan</p>
              <p className="text-lg font-bold text-gray-900">
                {selected.name} · ₵{selected.price.toLocaleString()} for {durationLabel(selected.durationDays)}
              </p>
              {isRenewal && isActive && (
                <p className="text-sm text-gray-500">Renewing adds {selected.durationDays} days to your current expiry date.</p>
              )}
              {isUpgrade && (
                <p className="text-sm text-gray-500">The unused value of your current plan is credited. You’ll see the exact amount before paying.</p>
              )}
              {notAnUpgrade && (
                <p className="text-sm text-gray-500">While your plan is active you can renew it or upgrade to a higher plan.</p>
              )}
            </div>
            <button onClick={handleContinue} disabled={continuing || (notAnUpgrade && !isAdmin)} className="btn btn-primary w-full px-8 py-3.5 sm:w-auto">
              {continuing ? "Opening agent onboarding..." : isAdmin ? "Manage plans in admin" : isAuthenticated ? ctaLabel : "Sign in to continue"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>}
          {isAuthenticated && !isAgent && !isAdmin && <p className="mt-4 text-center text-sm text-gray-500">Continue as {user.email}. Your existing account and customer history stay with you. Complete your agent profile after payment.</p>}
          {continueError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{continueError}</p>}
          {!selected && plans.length > 0 && (
            <p role="status" className="mt-8 rounded-3xl bg-white p-6 text-center text-sm text-gray-600 ring-1 ring-gray-200 sm:p-8">Select a plan to continue.</p>
          )}
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
