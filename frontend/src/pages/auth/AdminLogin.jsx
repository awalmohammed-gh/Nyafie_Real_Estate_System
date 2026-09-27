import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import { usePlatform } from "../../context/usePlatform";
import BrandLogo from "../../components/brand/BrandLogo";

// Full-screen admin sign in, shown by RequireAdmin whenever /admin/* is opened
// without an admin session. Credentials are checked by the backend only.
const AdminLogin = () => {
  const { siteName } = usePlatform();
  const { user, adminLogin } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const admin = await adminLogin(form);
      toast({ title: `Welcome back, ${admin.firstName}` });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-gray-950 px-4 py-10">
      <div className="absolute -top-40 -left-32 -z-10 h-[28rem] w-[28rem] rounded-full bg-brand-600/25 blur-3xl" />
      <div className="absolute -right-32 -bottom-40 -z-10 h-[24rem] w-[24rem] rounded-full bg-brand-900/40 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo tone="dark" size="lg" />
          <span className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-gray-300 ring-1 ring-white/10">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-300" />
            Administrators only
          </span>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{siteName} Admin Console</h1>
          <p className="mt-2 text-sm text-gray-400">Sign in with your administrator account to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
          {user && user.role !== "admin" && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              You're signed in as {user.name}, which isn't an admin account.
            </p>
          )}
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Admin email</span>
            <span className="relative block">
              <Mail className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                autoComplete="username"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                required
                className="field pl-10"
              />
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Password</span>
            <span className="relative block">
              <Lock className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                required
                className="field pr-11 pl-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-3 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-gray-400 hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className="btn btn-primary w-full py-3.5">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in to admin
          </button>
        </form>

        <Link to="/" className="mt-6 flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-400 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to the website
        </Link>
      </motion.div>
    </div>
  );
};

export default AdminLogin;
