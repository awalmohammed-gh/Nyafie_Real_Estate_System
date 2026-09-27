import { Link, Navigate, ScrollRestoration, useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import AuthForm from "../../components/auth/AuthForm";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import heroImage from "../../assets/heroBg2.jpg";
import { usePlatform } from "../../context/usePlatform";
import BrandLogo from "../../components/brand/BrandLogo";

const perks = [
  "Save properties and come back to them anytime",
  "Track every inquiry you send to agents",
  "Become an agent and list your own properties",
];

// Standalone, full-screen sign in / sign up (rendered outside the site layout,
// so there is no navbar or footer). Protected routes send users here with the
// page to return to in `state.from`.
const AuthPage = ({ mode = "login" }) => {
  const { siteName } = usePlatform();
  const { isAuthenticated, isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  // voluntary: the user chose to sign in from the navbar (vs. being sent by a protected page)
  const voluntary = Boolean(location.state?.voluntary);
  const destination = (role) => (role === "admin" && (voluntary || !from) ? "/admin/dashboard" : from || "/");

  // Admins land on their console unless they were sent here from a specific page
  if (isAuthenticated) return <Navigate to={destination(isAdmin ? "admin" : "user")} replace />;

  const handleSuccess = (user, usedMode) => {
    toast({ title: usedMode === "signup" ? `Welcome to ${siteName}, ${user.firstName}!` : `Welcome back, ${user.firstName}` });
    navigate(destination(user.role), { replace: true });
  };

  // Keep the URL in sync with the Sign In / Create Account tabs
  const handleModeChange = (next) =>
    navigate(next === "signup" ? "/register" : "/login", { replace: true, state: location.state });

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-2">
      <ScrollRestoration />

      {/* Form column */}
      <div className="flex min-h-dvh flex-col px-4 py-6 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="min-w-0">
            <BrandLogo />
          </Link>
          <Link to={from || "/"} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            Back to site
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="w-full max-w-md"
          >
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-2 mb-8 text-gray-600">
              {from && !voluntary ? "Please sign in to continue." : mode === "signup" ? `Join ${siteName} to find your dream home.` : `Sign in to your ${siteName} account.`}
            </p>
            <AuthForm initialMode={mode} onSuccess={handleSuccess} onModeChange={handleModeChange} />
          </motion.div>
        </div>

        <p className="text-center text-xs text-gray-400">© {new Date().getFullYear()} {siteName}</p>
      </div>

      {/* Image column (large screens) */}
      <div className="relative hidden overflow-hidden bg-gray-900 lg:block">
        <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-linear-to-t from-gray-950 via-gray-950/40 to-brand-900/20" />
        <div className="absolute inset-x-0 bottom-0 p-12">
          <h2 className="max-w-md text-3xl font-extrabold tracking-tight text-balance text-white xl:text-4xl">Your home search, organised.</h2>
          <ul className="mt-6 space-y-3">
            {perks.map((perk) => (
              <li key={perk} className="flex items-center gap-3 text-gray-200">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-300" />
                {perk}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
