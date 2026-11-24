import { useRef, useState } from "react";
import { AlertCircle, Bell, BellRing, Check, Eye, EyeOff, HandCoins, Loader2, LockKeyhole, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import CustomerProfileForm from "./CustomerProfileForm";
import ProfilePhotoEditor from "./ProfilePhotoEditor";

const sections = [
  { key: "profile", label: "Personal info", icon: UserRound },
  { key: "security", label: "Security", icon: LockKeyhole },
  { key: "notifications", label: "Notifications", icon: Bell },
];
const options = [
  { key: "inquiryUpdates", label: "Conversation replies", description: "When an agent replies to your conversation.", icon: MessageCircle },
  { key: "offerUpdates", label: "Offer updates", description: "When you submit an offer or its status changes.", icon: HandCoins },
  { key: "searchAlerts", label: "Saved search alerts", description: "When a new home matches one of your saved searches.", icon: BellRing },
];
const passwordFields = [
  { key: "current", label: "Current password", name: "currentPassword", autoComplete: "current-password" },
  { key: "next", label: "New password", name: "newPassword", autoComplete: "new-password" },
  { key: "confirm", label: "Confirm new password", name: "confirmPassword", autoComplete: "new-password" },
];

const CustomerSettings = () => {
  const { user, updateProfile, changePassword, requestPassword } = useAuth();
  const [active, setActive] = useState("profile");
  const tabs = useRef({});
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [visible, setVisible] = useState({});
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const passwordInputs = useRef({});
  const preferenceLock = useRef(false);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [preferenceRequest, setPreferenceRequest] = useState(null);
  const [preferenceError, setPreferenceError] = useState("");
  const [preferenceSaved, setPreferenceSaved] = useState("");
  const preferences = { inquiryUpdates: true, offerUpdates: true, searchAlerts: true, ...user.preferences };

  const navigateTabs = (event, key) => {
    const index = sections.findIndex((section) => section.key === key);
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % sections.length;
    else if (event.key === "ArrowLeft") next = (index + sections.length - 1) % sections.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = sections.length - 1;
    else return;
    event.preventDefault();
    setActive(sections[next].key);
    tabs.current[sections[next].key]?.focus();
  };

  const setPreference = async (key, value) => {
    if (preferenceLock.current) return;
    preferenceLock.current = true;
    setPreferenceRequest({ key, value });
    setPreferenceSaving(true);
    setPreferenceError("");
    setPreferenceSaved("");
    try {
      await updateProfile({ preferences: { ...preferences, [key]: value } });
      setPreferenceSaved(`${options.find((option) => option.key === key).label} ${value ? "enabled" : "disabled"}.`);
      setPreferenceRequest(null);
    } catch (error) {
      setPreferenceError(error.message || "Your change could not be saved.");
    } finally {
      preferenceLock.current = false;
      setPreferenceSaving(false);
    }
  };

  const handlePassword = async (event) => {
    event.preventDefault();
    if (passwordSaving) return;
    setPasswordError(null);
    setPasswordSaved(false);
    const fail = (field, message) => {
      setPasswordError({ field, message });
      passwordInputs.current[field]?.focus();
    };
    if (!passwords.current) return fail("current", "Enter your current password.");
    if (passwords.next.length < 15) return fail("next", "Use at least 15 characters for your new password.");
    if (new TextEncoder().encode(passwords.next).length > 72) return fail("next", "This password is too long. Please use a shorter password.");
    if (passwords.next !== passwords.confirm) return fail("confirm", "The new passwords don't match.");
    setPasswordSaving(true);
    try {
      await changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "", confirm: "" });
      setVisible({});
      setPasswordSaved(true);
    } catch (error) {
      fail(error.message === "Your current password is incorrect." ? "current" : null, error.message || "Your password could not be updated.");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="customer-settings-layout">
      <section className="account-surface customer-profile-card" aria-label="Profile photo">
        <ProfilePhotoEditor />
      </section>
      <div className="account-surface account-settings-main">
        <div role="tablist" aria-label="Account settings sections" className="account-settings-tabs">
          {sections.map(({ key, label, icon: Icon }) => <button key={key} ref={(button) => { tabs.current[key] = button; }} type="button" role="tab" id={`settings-tab-${key}`} aria-controls={`settings-panel-${key}`} aria-selected={active === key} tabIndex={active === key ? 0 : -1} onClick={() => setActive(key)} onKeyDown={(event) => navigateTabs(event, key)}><Icon className="h-4 w-4 shrink-0" />{label}</button>)}
        </div>
        <section role="tabpanel" id="settings-panel-profile" aria-labelledby="settings-tab-profile" hidden={active !== "profile"}>
          <CustomerProfileForm />
        </section>
        <section role="tabpanel" id="settings-panel-security" aria-labelledby="settings-tab-security" hidden={active !== "security"}>
          {user.passwordMissing ? <>
            <header className="account-section-heading"><p className="account-eyebrow">Stay protected</p><h2>Password & security</h2><p>You sign in with Google. Create a NyaFie password to also sign in by typing your email.</p></header>
            <footer className="account-section-footer"><p className="account-save-status text-gray-500">Continue with Google keeps working too.</p><button type="button" onClick={() => requestPassword("settings")} className="account-button"><LockKeyhole className="h-4 w-4" />Create password</button></footer>
          </> : <form aria-labelledby="settings-security-title" onSubmit={handlePassword} noValidate>
            <header className="account-section-heading"><p className="account-eyebrow">Stay protected</p><h2 id="settings-security-title">Password & security</h2><p>A strong, unique password helps keep your account safe.</p></header>
            <div className="account-section-body">
              <fieldset disabled={passwordSaving} className="grid gap-5 sm:grid-cols-2">
                <legend className="sr-only">Change password</legend>
                <input type="email" name="username" autoComplete="username" value={user.email} readOnly hidden />
                {passwordFields.map(({ key, label, name, autoComplete }) => {
                  const invalid = passwordError?.field === key;
                  return (
                    <div key={key} className={key === "current" ? "sm:col-span-2" : ""}>
                      <label htmlFor={`pw-${key}`} className="account-label">{label}</label>
                      <div className="relative">
                        <input ref={(input) => { passwordInputs.current[key] = input; }} id={`pw-${key}`} name={name} type={visible[key] ? "text" : "password"} autoComplete={autoComplete} value={passwords[key]} required minLength={key === "current" ? undefined : 15} aria-invalid={invalid || undefined} aria-describedby={invalid ? `pw-${key}-error` : key === "next" ? "password-hint" : undefined} onChange={(event) => { setPasswords((previous) => ({ ...previous, [key]: event.target.value })); setPasswordSaved(false); if (!passwordError?.field || passwordError.field === key || (key === "next" && passwordError.field === "confirm")) setPasswordError(null); }} className="account-input account-input--password" />
                        <button type="button" aria-label={`${visible[key] ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={Boolean(visible[key])} onClick={() => setVisible((previous) => ({ ...previous, [key]: !previous[key] }))} className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-gray-400 hover:text-brand-700">{visible[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                      </div>
                      {key === "next" && <p id="password-hint" className="account-field-hint">Use at least 15 characters.</p>}
                      {invalid && <p id={`pw-${key}-error`} role="alert" className="mt-2 text-xs text-red-700">{passwordError.message}</p>}
                    </div>
                  );
                })}
              </fieldset>
              {passwordError && !passwordError.field && <p role="alert" className="account-error"><AlertCircle className="h-4 w-4 shrink-0" />{passwordError.message}</p>}
            </div>
            <footer className="account-section-footer"><p role="status" aria-live="polite" className={`account-save-status ${passwordSaved ? "text-emerald-700" : "text-gray-500"}`}>{passwordSaved ? <><Check className="h-4 w-4" />Password updated.</> : passwordSaving ? "Updating your password..." : "Changes take effect immediately."}</p><button type="submit" disabled={passwordSaving || !passwords.current || !passwords.next || !passwords.confirm} className="account-button">{passwordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}{passwordSaving ? "Updating..." : "Update password"}</button></footer>
          </form>}
        </section>
        <section role="tabpanel" id="settings-panel-notifications" aria-labelledby="settings-tab-notifications" hidden={active !== "notifications"}>
          <header className="account-section-heading"><p className="account-eyebrow">Make it yours</p><h2>Notification preferences</h2><p>Choose which updates appear in your NyaFie notification bell.</p></header>
          <div className="account-section-body !pt-2">
            <ul>
              {options.map(({ key, label, description, icon: Icon }) => {
                const checked = preferenceSaving && preferenceRequest?.key === key ? preferenceRequest.value : preferences[key];
                return <li key={key} className="account-notification-row"><span className="account-notification-icon"><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-gray-800">{label}</p><p id={`preference-${key}-description`} className="mt-1 text-xs leading-relaxed text-gray-500">{description}</p></div><button type="button" role="switch" aria-checked={checked} aria-label={label} aria-describedby={`preference-${key}-description`} disabled={preferenceSaving} onClick={() => setPreference(key, !preferences[key])} className="grid h-11 w-12 shrink-0 place-items-center rounded-xl disabled:opacity-50"><span aria-hidden="true" className={`relative h-6 w-10 rounded-full transition-colors ${checked ? "bg-brand-600" : "bg-gray-200"}`}><span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-4" : ""}`} /></span></button></li>;
              })}
            </ul>
            <div className="account-essential-note"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><div><p className="text-xs font-semibold text-gray-800">Essential updates are always on</p><p className="mt-1 text-xs leading-relaxed text-gray-500">Booking, purchase and payment notifications help you keep track of your transactions.</p></div></div>
          </div>
          <footer className="account-section-footer">{preferenceError ? <div role="alert" className="flex w-full flex-wrap items-center justify-between gap-3"><p className="flex flex-1 items-start gap-2 text-xs text-red-700"><AlertCircle className="h-4 w-4 shrink-0" /><span>Your change wasn't saved. {preferenceError}</span></p><button type="button" onClick={() => setPreference(preferenceRequest.key, preferenceRequest.value)} className="account-text-button">Try again</button></div> : <p role="status" aria-live="polite" className={`account-save-status ${preferenceSaved ? "text-emerald-700" : "text-gray-500"}`}>{preferenceSaving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving your preference...</> : preferenceSaved ? <><Check className="h-4 w-4" />{preferenceSaved}</> : "Your preferences save automatically."}</p>}</footer>
        </section>
      </div>
    </div>
  );
};

export default CustomerSettings;
