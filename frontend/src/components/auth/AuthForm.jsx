import { useId, useState } from "react";
import { AlertCircle, ArrowRight, Loader2, Mail, Phone, User } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { AuthField, AuthPasswordField } from "./AuthField";
import EmailVerificationForm from "./EmailVerificationForm";
import PasswordResetForm from "./PasswordResetForm";
import GoogleSignIn from "./GoogleSignIn";

const emptyForm = { fullName: "", firstName: "", lastName: "", email: "", phone: "", password: "", confirmPassword: "", termsAgree: false };

const AuthForm = ({ initialMode = "login", onSuccess, onModeChange }) => {
  const { login, register, googleLogin, domain } = useAuth();
  const [localMode, setLocalMode] = useState(initialMode);
  const mode = onModeChange ? initialMode : localMode;
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verification, setVerification] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const [googleAttempt, setGoogleAttempt] = useState(0);
  const errorId = useId();
  const isSignup = mode === "signup";
  const isAgent = domain === "agent";

  const switchMode = (next) => {
    if (next === mode) return;
    setLocalMode(next);
    onModeChange?.(next);
    setError("");
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((previous) => ({ ...previous, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError("");
    if (isSignup && formData.password.length < 15) {
      setError("Use at least 15 characters for your password.");
      return;
    }
    if (isSignup && isAgent && formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const user = isSignup ? await register(formData) : await login(formData);
      if (user?.verificationRequired) {
        setVerification(user);
        setFormData((previous) => ({ ...previous, password: "", confirmPassword: "" }));
        setSubmitting(false);
        return;
      }
      onSuccess?.(user, mode);
    } catch (err) {
      setError(err.message || "We couldn't complete your request. Please try again.");
      setSubmitting(false);
    }
  };

  const handleGoogle = async (credential, challenge) => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const user = await googleLogin(credential, challenge);
      onSuccess?.(user, user.createdWithGoogle ? "signup" : "login");
    } catch (err) {
      setError(err.message || "Google sign-in failed. Please try again.");
      setSubmitting(false);
      setGoogleAttempt((value) => value + 1);
    }
  };

  // A finished sign-up is a new account, even when it was finished from the sign-in form
  if (verification) return <EmailVerificationForm verification={verification} onSuccess={(user) => onSuccess?.(user, verification.registration ? "signup" : mode)} onBack={() => { setVerification(null); setError(""); switchMode("login"); }} />;
  if (recovering) return <PasswordResetForm initialEmail={formData.email} onBack={(email) => { setRecovering(false); setError(""); setFormData((previous) => ({ ...previous, email, password: "", confirmPassword: "" })); }} />;

  return (
    <div>
      <div className="auth-mode-tabs" role="group" aria-label="Sign in or create an account">
        {[{ value: "login", label: "Sign in" }, { value: "signup", label: "Create account" }].map((tab) => (
          <button key={tab.value} type="button" disabled={submitting} onClick={() => switchMode(tab.value)} aria-pressed={mode === tab.value} className={mode === tab.value ? "is-active" : ""}>{tab.label}</button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="auth-form" aria-busy={submitting} aria-describedby={error ? errorId : undefined}>
        <fieldset disabled={submitting} className="auth-fields">
          {isSignup && (
            <>
              {isAgent ? (
                <AuthField label="Full name" icon={User} name="fullName" placeholder="Your full name" autoComplete="name" value={formData.fullName} onChange={handleChange} required maxLength={160} />
              ) : (
                <div className="auth-field-row">
                  <AuthField label="First name" icon={User} name="firstName" placeholder="First name" autoComplete="given-name" value={formData.firstName} onChange={handleChange} required />
                  <AuthField label="Last name" icon={User} name="lastName" placeholder="Last name" autoComplete="family-name" value={formData.lastName} onChange={handleChange} required />
                </div>
              )}
              <AuthField label={isAgent ? "Phone number" : "Phone number (optional)"} icon={Phone} type="tel" name="phone" placeholder="e.g. 024 123 4567" autoComplete="tel" value={formData.phone} onChange={handleChange} required={isAgent} />
            </>
          )}
          <AuthField label="Email address" icon={Mail} type="email" name="email" placeholder="you@example.com" autoComplete={isSignup ? "email" : "username"} value={formData.email} onChange={handleChange} required />
          <AuthPasswordField label="Password" name="password" placeholder={isSignup ? "Create a password" : "Enter your password"} autoComplete={isSignup ? "new-password" : "current-password"} value={formData.password} onChange={handleChange} required minLength={isSignup ? 15 : undefined} hint={isSignup ? "Use at least 15 characters." : undefined} />
          {isSignup && isAgent && <AuthPasswordField label="Confirm password" name="confirmPassword" placeholder="Enter your password again" autoComplete="new-password" value={formData.confirmPassword} onChange={handleChange} required />}
          {isSignup && (
            <label className="auth-terms"><input type="checkbox" name="termsAgree" checked={formData.termsAgree} onChange={handleChange} required /><span>I agree to the Terms of Service and Privacy Policy.</span></label>
          )}
        </fieldset>

        {error && <p id={errorId} role="alert" className="auth-error"><AlertCircle size={18} aria-hidden="true" />{error}</p>}

        {/* Creating an account needs the terms accepted first */}
        <button type="submit" disabled={submitting || (isSignup && !formData.termsAgree)} aria-busy={submitting} className="auth-submit">
          <span>{submitting ? isSignup ? "Creating your account…" : "Signing you in…" : isSignup ? "Create account" : isAgent ? "Sign in as agent" : "Sign in"}</span>
          {submitting ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
        </button>
        {isSignup && isAgent && <p className="auth-onboarding-note">Next: complete your profile and submit your application. Your dashboard opens after admin approval and any required subscription.</p>}
      </form>
      {!isSignup && domain === "customer" && <button type="button" className="account-text-button mt-5" disabled={submitting} onClick={() => { setRecovering(true); setError(""); setFormData((previous) => ({ ...previous, password: "", confirmPassword: "" })); }}>Forgot your password?</button>}
      {domain === "customer" && <GoogleSignIn key={googleAttempt} onCredential={handleGoogle} disabled={submitting} />}
    </div>
  );
};

export default AuthForm;
