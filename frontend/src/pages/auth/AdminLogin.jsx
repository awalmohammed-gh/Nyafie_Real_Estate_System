import { useId, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AlertCircle, ArrowRight, Loader2, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import AuthLayout from "../../components/auth/AuthLayout";
import { AuthField, AuthPasswordField } from "../../components/auth/AuthField";
import PageLoader from "../../components/ui/PageLoader";
import { sessionDestination } from "../../utils/sessionDomain";

const AdminLogin = () => {
  const { user, ready, adminLogin } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const errorId = useId();

  if (!ready) return <PageLoader fullScreen label="Checking your session..." />;
  if (user) return <Navigate to={sessionDestination("admin", location.state?.from)} replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const admin = await adminLogin(form);
      toast({ title: `Welcome back, ${admin.firstName}` });
    } catch (err) {
      setError(err.message || "We couldn't sign you in. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout domain="admin">
      <div className="auth-admin-mark"><ShieldCheck size={25} aria-hidden="true" /></div>
      <div className="auth-heading">
        <span className="auth-eyebrow">Admin console</span>
        <h1>Welcome back.</h1>
        <p>Sign in to oversee your marketplace and keep everything moving.</p>
      </div>
      <form onSubmit={handleSubmit} className="auth-form" aria-busy={submitting} aria-describedby={error ? errorId : undefined}>
        <fieldset disabled={submitting} className="auth-fields">
          <AuthField label="Administrator email" icon={Mail} type="email" name="email" placeholder="admin@example.com" autoComplete="username" value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} required />
          <AuthPasswordField label="Password" name="password" placeholder="Enter your password" autoComplete="current-password" value={form.password} onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))} required />
        </fieldset>
        {error && <p id={errorId} role="alert" className="auth-error"><AlertCircle size={18} aria-hidden="true" />{error}</p>}
        <button type="submit" disabled={submitting} className="auth-submit"><span>{submitting ? "Signing you in…" : "Sign in to admin"}</span>{submitting ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}</button>
      </form>
      <p className="auth-admin-note"><ShieldCheck size={15} aria-hidden="true" />For authorised administrators only.</p>
    </AuthLayout>
  );
};

export default AdminLogin;
