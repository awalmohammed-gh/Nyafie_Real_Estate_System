import EmailStatus from "../ui/EmailStatus";
import { useState } from "react";
import { AlertCircle, Check, Loader2, Save } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import ProfilePhotoEditor from "./ProfilePhotoEditor";

const CustomerProfileForm = ({ showPhoto = false }) => {
  const { user, updateProfile } = useAuth();
  const savedForm = { firstName: user.firstName, lastName: user.lastName, phone: user.phone || "" };
  const [form, setForm] = useState(savedForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = Object.keys(form).some((key) => form[key].trim() !== savedForm[key]);
  const change = (key, value) => { setForm((previous) => ({ ...previous, [key]: value })); setError(""); setSaved(false); };

  const submit = async (event) => {
    event.preventDefault();
    if (saving || !dirty) return;
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const next = await updateProfile(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])));
      setForm({ firstName: next.firstName, lastName: next.lastName, phone: next.phone || "" });
      setSaved(true);
    } catch (saveError) {
      setError(saveError.message || "Your details couldn't be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} aria-labelledby="personal-info-title">
      <header className="account-section-heading"><p className="account-eyebrow">Your account</p><h2 id="personal-info-title">Personal information</h2><p>Make yourself at home. Keep your details up to date.</p></header>
      <div className="account-section-body">
        {showPhoto && <div className="mb-7 border-b border-gray-100 pb-6"><ProfilePhotoEditor /></div>}
        <fieldset disabled={saving} className="grid gap-5 sm:grid-cols-2">
          <legend className="sr-only">Personal information</legend>
          <div><label htmlFor="customer-first-name" className="account-label">First name</label><input id="customer-first-name" name="firstName" required maxLength={80} value={form.firstName} onChange={(event) => change("firstName", event.target.value)} autoComplete="given-name" className="account-input" /></div>
          <div><label htmlFor="customer-last-name" className="account-label">Last name</label><input id="customer-last-name" name="lastName" required maxLength={80} value={form.lastName} onChange={(event) => change("lastName", event.target.value)} autoComplete="family-name" className="account-input" /></div>
          <div className="sm:col-span-2"><label htmlFor="customer-email" className="account-label">Email address</label><input id="customer-email" type="email" value={user.email} readOnly aria-describedby="customer-email-hint" className="account-input account-input--readonly" /><p id="customer-email-hint" className="account-field-hint">Your email is used to sign in to your account. <EmailStatus verified={user.emailVerified} className="align-middle" /></p></div>
          <div className="sm:col-span-2"><label htmlFor="customer-phone" className="account-label">Phone number <span className="font-normal text-gray-400">(optional)</span></label><input id="customer-phone" name="phone" type="tel" maxLength={30} value={form.phone} onChange={(event) => change("phone", event.target.value)} autoComplete="tel" placeholder="+233 24 000 0000" className="account-input" /></div>
        </fieldset>
        {error && <p role="alert" className="account-error"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
      </div>
      <footer className="account-section-footer">
        <p role="status" aria-live="polite" className={`account-save-status ${saved ? "text-emerald-700" : "text-gray-500"}`}>{saved ? <><Check className="h-4 w-4" />Changes saved.</> : saving ? "Saving your details..." : dirty ? "You have unsaved changes." : "Your details are up to date."}</p>
        <div className="account-footer-actions"><button type="button" disabled={!dirty || saving} className="account-text-button" onClick={() => { setForm(savedForm); setError(""); setSaved(false); }}>Discard</button><button type="submit" disabled={!dirty || saving} className="account-button">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save changes</button></div>
      </footer>
    </form>
  );
};

export default CustomerProfileForm;
