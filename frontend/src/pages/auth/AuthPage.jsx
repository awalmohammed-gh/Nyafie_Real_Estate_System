import { Link, Navigate, ScrollRestoration, useLocation, useNavigate } from "react-router-dom";
import { Building2, House } from "lucide-react";
import AuthForm from "../../components/auth/AuthForm";
import AuthLayout from "../../components/auth/AuthLayout";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import { usePlatform } from "../../context/usePlatform";
import PageLoader from "../../components/ui/PageLoader";
import { agentDestination, authRedirectDestination, sessionDestination } from "../../utils/sessionDomain";

const AuthPage = ({ mode = "login" }) => {
  const { siteName } = usePlatform();
  const { isAuthenticated, ready, domain, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const voluntary = Boolean(location.state?.voluntary);
  const isAgent = domain === "agent";
  const isSignup = mode === "signup";
  const agentSignup = isAgent && isSignup;
  const redirect = authRedirectDestination({ isAuthenticated, explicitSignIn: location.state?.explicitSignIn || agentSignup, domain, user, from });
  const selectedPlan = typeof from === "string" && from.startsWith("/") ? new URL(from, "https://nyafie.invalid").searchParams.get("plan") : null;
  const customerContinue = `/agent/plans${selectedPlan ? `?plan=${encodeURIComponent(selectedPlan)}` : ""}`;

  if (!ready) return <PageLoader fullScreen label="Checking your session..." />;
  if (redirect) return <Navigate to={redirect} replace />;

  const handleSuccess = (nextUser, usedMode) => {
    toast({ title: usedMode === "signup" ? `Welcome to ${siteName}, ${nextUser.firstName}!` : `Welcome back, ${nextUser.firstName}` });
    navigate(isAgent ? agentDestination(nextUser, from) : sessionDestination(domain, from), { replace: true });
  };

  const handleModeChange = (next) => navigate((next === "signup" ? "/register" : "/login") + (isAgent ? "?account=agent" : ""), { replace: true, state: location.state });

  const handleAccountChange = (account) => {
    if (account === domain) return;
    navigate((isSignup ? "/register" : "/login") + (account === "agent" ? "?account=agent" : ""), {
      replace: true,
      state: { ...location.state, explicitSignIn: true },
    });
  };

  return (
    <AuthLayout domain={domain}>
      <ScrollRestoration />
      <div className="auth-account-picker" role="group" aria-label="Account type">
        {[{ value: "customer", label: "Customer", icon: House }, { value: "agent", label: "Agent", icon: Building2 }].map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" aria-pressed={domain === value} onClick={() => handleAccountChange(value)} className={domain === value ? "is-active" : ""}><Icon size={17} aria-hidden="true" />{label}</button>
        ))}
      </div>
      <div className="auth-heading">
        <span className="auth-eyebrow">{isAgent ? "Agent workspace" : "Your home journey"}</span>
        <h1>{isSignup ? isAgent ? "Open new doors." : "Find your place." : "Welcome back."}</h1>
        <p>{isSignup ? isAgent ? "Create your account. Your next opportunity starts here." : "A home you love starts with an account of your own." : from && !voluntary ? "Sign in to continue where you left off." : isAgent ? "Sign in to your agent account and take your next step." : "Your saved homes and conversations are waiting for you."}</p>
        {isAgent && isSignup && <span className="auth-step"><span>01</span>Account creation <span className="auth-step-divider" />Step 1 of 4</span>}
      </div>
      {agentSignup && isAuthenticated && <div role="status" className="mb-5 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm leading-relaxed text-brand-900"><p><strong className="font-semibold">{user.name}</strong> is signed in as an agent on this browser. Registering below creates a different agent account.</p><Link to={agentDestination(user)} className="mt-2 inline-block font-semibold underline underline-offset-4">That's me, continue as {user.firstName}</Link></div>}
      <AuthForm key={domain} initialMode={mode} onSuccess={handleSuccess} onModeChange={handleModeChange} />
      {isAgent && <div className="mt-6 rounded-2xl bg-brand-50 p-4 text-sm leading-relaxed text-brand-900"><p>Already have a customer account? Keep your existing email and password.</p><Link to="/login" state={{ from: customerContinue }} className="mt-2 inline-block font-semibold underline underline-offset-4">Continue with my existing account</Link></div>}
    </AuthLayout>
  );
};

export default AuthPage;
