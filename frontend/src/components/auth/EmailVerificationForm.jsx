import { useEffect, useId, useState } from "react";
import { AlertCircle, Loader2, Mail } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { AuthField } from "./AuthField";

export default function EmailVerificationForm({ verification, onSuccess, onBack }) {
  const { verifyEmail, resendVerification } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState(verification.deliveryError || "");
  const [message, setMessage] = useState(verification.sent ? "Your verification code has been sent." : "");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(verification.retryAfter || 0);
  const errorId = useId();

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try { onSuccess(await verifyEmail(verification.challenge, code)); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const resend = async () => {
    if (busy || remaining > 0) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await resendVerification(verification.challenge);
      setRemaining(result.retryAfter || 60);
      setCode("");
      setMessage("A new code has been sent. Use the code from the latest email.");
    } catch (err) { setError(err.message); if (err.retryAfter) setRemaining(err.retryAfter); }
    finally { setBusy(false); }
  };

  return <div>
    <div className="auth-heading">
      <h2 className="text-xl font-semibold tracking-tight">Check your email</h2>
      <p>{verification.registration ? "To finish creating your account, enter" : verification.twoStep ? "To finish signing in, enter" : "Enter"} the six-digit code sent to <strong>{verification.email}</strong>. It expires in 10 minutes. Check your spam folder too.</p>
    </div>
    <form className="auth-form" onSubmit={submit} aria-busy={busy} aria-describedby={error ? errorId : undefined}>
      <AuthField label={verification.twoStep ? "Sign-in code" : "Verification code"} icon={Mail} name="verificationCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} disabled={busy} required autoFocus />
      {error && <p id={errorId} role="alert" className="auth-error"><AlertCircle size={18} aria-hidden="true" />{error}</p>}
      <p role="status" className="auth-field-hint">{message}</p>
      <button type="submit" className="auth-submit" disabled={busy || code.length !== 6}>{busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}{verification.registration ? "Verify & create account" : verification.twoStep ? "Verify & sign in" : "Verify email & continue"}</button>
      <button type="button" className="account-text-button" disabled={busy || remaining > 0} onClick={resend}>{remaining > 0 ? `Resend code in ${remaining}s` : verification.twoStep ? "Resend sign-in code" : "Resend verification code"}</button>
      <button type="button" className="account-text-button" disabled={busy} onClick={onBack}>Back to sign in / use a different email</button>
    </form>
  </div>;
}
