import { useId, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import { AuthPasswordField } from "./AuthField";
import GoogleSignIn from "./GoogleSignIn";
import Modal from "../ui/Modal";
import "./auth.css";

/**
 * A NyaFie password for someone who signed up with Google, so the same email also works typed into the
 * sign-in form. Offered after Google sign-in and in Settings; required before agent onboarding.
 */
const CreatePasswordDialog = () => {
  const { user, askPassword, changePassword, skipPassword, googleLogin } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // They signed in with Google a while ago: Google confirms it's still them before the password is saved
  const [confirming, setConfirming] = useState(false);
  const [googleAttempt, setGoogleAttempt] = useState(0);
  const formId = useId();
  const forAgent = askPassword === "agent";

  const close = () => { if (!saving) { setConfirming(false); setError(""); skipPassword(); } };
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await changePassword("", password);
      toast({ title: "Password created", description: "Sign in with your email and password, or with Google." });
    } catch (err) {
      if (err.code === "GOOGLE_CONFIRM") setConfirming(true);
      else setError(err.message || "Your password couldn't be saved. Please try again.");
      setSaving(false);
    }
  };
  const submit = (event) => {
    event.preventDefault();
    if (saving) return;
    if (password.length < 15) return setError("Use at least 15 characters for your password.");
    if (password !== confirm) return setError("The passwords don't match.");
    save();
  };
  const confirmGoogle = async (credential, challenge) => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await googleLogin(credential, challenge, user.id);
      setConfirming(false);
      await save();
    } catch (err) {
      setError(err.message || "Google couldn't confirm it's you. Please try again.");
      setGoogleAttempt((value) => value + 1);
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(askPassword)} onClose={close} title="Create your NyaFie password" size="sm" footer={<>
      <button type="button" onClick={close} disabled={saving} className="btn btn-light">{forAgent ? "Cancel" : "Not now"}</button>
      {!confirming && <button type="submit" form={formId} disabled={saving || !password || !confirm} className="btn btn-primary">{saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{saving ? "Saving..." : forAgent ? "Save and continue" : "Save password"}</button>}
    </>}>
      {confirming ? <>
        <p className="text-sm leading-relaxed text-gray-600">To keep your account safe, confirm it's you. Choose <strong className="break-all font-semibold text-gray-900">{user?.email}</strong> and your password is saved.</p>
        <GoogleSignIn key={googleAttempt} confirm onCredential={confirmGoogle} disabled={saving} />
      </> : <>
        <p className="mb-5 text-sm leading-relaxed text-gray-600">{forAgent
          ? <>The agent area opens with an email and password, not Google. Choose a password for <strong className="break-all font-semibold text-gray-900">{user?.email}</strong>, then continue to your agent application.</>
          : <>Google keeps your Google password private, so choose one for NyaFie. Next time you can type <strong className="break-all font-semibold text-gray-900">{user?.email}</strong> and this password, or keep using Google.</>}</p>
        <form id={formId} onSubmit={submit} noValidate>
          {/* Lets the browser save the password under this email */}
          <input type="email" name="username" autoComplete="username" value={user?.email || ""} readOnly hidden />
          <fieldset disabled={saving} className="auth-fields">
            <AuthPasswordField label="New password" name="newPassword" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} hint="Use at least 15 characters." required />
            <AuthPasswordField label="Confirm password" name="confirmPassword" autoComplete="new-password" value={confirm} onChange={(event) => { setConfirm(event.target.value); setError(""); }} required />
          </fieldset>
        </form>
      </>}
      {error && <p role="alert" className="auth-error mt-4"><AlertCircle size={18} aria-hidden="true" />{error}</p>}
    </Modal>
  );
};

export default CreatePasswordDialog;
