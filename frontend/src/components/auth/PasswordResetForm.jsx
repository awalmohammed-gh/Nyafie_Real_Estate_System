import { useEffect, useId, useState } from "react";
import { AlertCircle, Loader2, Mail } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { AuthField, AuthPasswordField } from "./AuthField";

export default function PasswordResetForm({ initialEmail = "", onBack }) {
  const { requestPasswordReset, resetPassword } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [step, setStep] = useState("request");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [remaining, setRemaining] = useState(0);
  const errorId = useId();

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

  const requestCode = async (event) => {
    event?.preventDefault();
    if (busy || remaining > 0) return;
    setBusy(true);
    setError("");
    try {
      const response = await requestPasswordReset(email.trim());
      setEmail(email.trim().toLowerCase());
      setMessage(response.message);
      setRemaining(response.data?.retryAfter || 60);
      setCode("");
      setStep("reset");
    } catch (err) { setError(err.message); if (err.retryAfter) setRemaining(err.retryAfter); }
    finally { setBusy(false); }
  };

  const reset = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (password !== confirm) { setError("The new passwords don't match."); return; }
    if (new TextEncoder().encode(password).length > 72) { setError("Use a password of at most 72 bytes."); return; }
    setBusy(true);
    try {
      const response = await resetPassword(email, code, password);
      setPassword(""); setConfirm(""); setCode("");
      setMessage(response.message);
      setStep("done");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return <div>
    <div className="auth-heading">
      <h2 className="text-xl font-semibold tracking-tight">{step === "done" ? "Password updated" : "Reset your password"}</h2>
      <p>{step === "request" ? "Enter your customer account email and we'll send a reset code." : step === "reset" ? `Enter the six-digit code sent to ${email} and choose a new password. The code expires in 10 minutes.` : "Sign in again using your new password."}</p>
    </div>
    {step === "done" ? <p role="status" className="auth-field-hint">{message}</p> : <form className="auth-form" onSubmit={step === "request" ? requestCode : reset} aria-busy={busy} aria-describedby={error ? errorId : undefined}>
      <fieldset className="auth-fields" disabled={busy}>
        {step === "request" ? <AuthField label="Email address" icon={Mail} name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoFocus /> : <>
          <AuthField label="Reset code" icon={Mail} name="resetCode" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required autoFocus />
          <AuthPasswordField label="New password" name="newPassword" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required hint="Use at least 8 characters." />
          <AuthPasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
        </>}
      </fieldset>
      {error && <p id={errorId} role="alert" className="auth-error"><AlertCircle size={18} aria-hidden="true" />{error}</p>}
      <p role="status" className="auth-field-hint">{message}</p>
      <button type="submit" className="auth-submit" disabled={busy || (step === "request" && remaining > 0)}>{busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}{busy ? "Please wait..." : step === "request" ? "Send reset code" : "Save new password"}</button>
      {step === "reset" && <button type="button" className="account-text-button" disabled={busy || remaining > 0} onClick={requestCode}>{remaining > 0 ? `Resend code in ${remaining}s` : "Resend reset code"}</button>}
      {step === "reset" && <button type="button" className="account-text-button" disabled={busy} onClick={() => { setStep("request"); setError(""); setMessage(""); setRemaining(0); setCode(""); setPassword(""); setConfirm(""); }}>Use a different email</button>}
    </form>}
    <button type="button" className="account-text-button mt-5" disabled={busy} onClick={() => onBack(email)}>Back to sign in</button>
  </div>;
}
