import { useState } from "react";
import { AlertCircle, Bell, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import PageTitle from "../../components/agent/PageTitle";
import AccountShell from "../../components/account/AccountShell";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";

const notificationOptions = [
  { key: "newListings", label: "New listings", description: "Weekly email with new properties in areas you browse." },
  { key: "inquiryUpdates", label: "Inquiry updates", description: "When an agent responds or an inquiry is updated." },
  { key: "offers", label: "Offers & news", description: "Occasional product news and promotions." },
];

const Toggle = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="relative grid h-11 w-14 shrink-0 place-items-center rounded-lg disabled:opacity-50"
  >
    <span aria-hidden="true" className={`relative block h-7 w-12 rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-gray-200"}`}><span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} /></span>
  </button>
);

const AgentSettingsShell = ({ title, description, children }) => <><PageTitle title={title} description={description} eyebrow="Your account" />{children}</>;
const agentNotificationOptions = [
  { key: "newListings", label: "Property updates", description: "Updates about your listings and activity on HomeBase." },
  { key: "inquiryUpdates", label: "Customer inquiries", description: "Keep up with inquiries and conversations about your properties." },
  { key: "offers", label: "Offers & platform news", description: "Offer updates, product news and occasional promotions." },
];
export const AccountSettings = ({ activeSection = null, showAccountSummary = true }) => {
  const { user, isAgent, updateProfile, changePassword } = useAuth();
  const { toast } = useToast();
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const preferences = { newListings: true, inquiryUpdates: true, offers: false, ...user.preferences };

  const setPreference = async (key, value) => {
    setPreferenceSaving(true);
    try {
      await updateProfile({ preferences: { ...preferences, [key]: value } });
      toast({ title: "Preferences saved" });
    } catch (err) {
      toast({ type: "error", title: err.message });
    } finally {
      setPreferenceSaving(false);
    }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    setPwError("");
    if (passwords.next.length < 8) return setPwError("Your new password needs at least 8 characters.");
    if (passwords.next !== passwords.confirm) return setPwError("The new passwords don't match.");
    setPwSaving(true);
    try {
      await changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "", confirm: "" });
      toast({ title: "Password updated" });
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <>
      {isAgent && showAccountSummary && <div className="workspace-card mb-6 flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="workspace-eyebrow">Signed in as</p><p className="mt-2 break-all text-sm font-semibold text-gray-900">{user.email}</p></div><span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700"><ShieldCheck className="h-4 w-4" />Approved agent account</span></div>}
      <div className={activeSection ? "min-w-0" : "grid grid-cols-1 gap-6 lg:grid-cols-2"}>
        <form id="settings-security" aria-labelledby="settings-security-title" hidden={activeSection !== null && activeSection !== "security"} onSubmit={handlePassword} className={`space-y-5 bg-white p-5 sm:p-8 ${isAgent ? "workspace-card settings-content-card" : "rounded-3xl ring-1 ring-gray-200"}`}>
          <header className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><ShieldCheck className="h-5 w-5" /></span><div><h2 id="settings-security-title" className="text-lg font-semibold text-gray-900">Password & security</h2><p className="mt-1 text-sm leading-relaxed text-gray-500">Keep your account secure with a strong, unique password.</p></div></header>
          <fieldset disabled={pwSaving} className="space-y-4 border-t border-gray-100 pt-5">
          <legend className="sr-only">Change password</legend>
          {[
            ["current", "Current password", "current-password"],
            ["next", "New password", "new-password"],
            ["confirm", "Confirm new password", "new-password"],
          ].map(([key, label, autoComplete]) => (
            <div key={key}>
              <label htmlFor={`pw-${key}`} className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
              <input
                id={`pw-${key}`}
                type={showPasswords ? "text" : "password"}
                autoComplete={autoComplete}
                value={passwords[key]}
                onChange={(e) => setPasswords((p) => ({ ...p, [key]: e.target.value }))}
                required
                minLength={key === "current" ? undefined : 8}
                className="field"
              />
            </div>
          ))}
          <button type="button" onClick={() => setShowPasswords((v) => !v)} aria-pressed={showPasswords} className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-gray-500">{showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showPasswords ? "Hide passwords" : "Show passwords"}</button>
          <p className="text-xs leading-relaxed text-gray-500">Use at least 8 characters for your new password.</p>
          </fieldset>
          {pwError && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {pwError}
            </p>
          )}
          <div className="flex justify-end border-t border-gray-100 pt-5"><button type="submit" disabled={pwSaving} className="btn btn-primary w-full sm:w-auto">
            {pwSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Update password
          </button></div>
        </form>

        <section id="settings-notifications" aria-labelledby="settings-notifications-title" hidden={activeSection !== null && activeSection !== "notifications"} className={`bg-white p-5 sm:p-8 ${isAgent ? "workspace-card settings-content-card" : "rounded-3xl ring-1 ring-gray-200"}`}>
          <header className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Bell className="h-5 w-5" /></span><div><h2 id="settings-notifications-title" className="text-lg font-semibold text-gray-900">Notification preferences</h2><p className="mt-1 text-sm leading-relaxed text-gray-500">Choose which updates you want to receive.</p></div></header>
          <ul className="mt-5 divide-y divide-gray-100 border-y border-gray-100">
            {(isAgent ? agentNotificationOptions : notificationOptions).map((option) => (
              <li key={option.key} className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{option.label}</p>
                  <p className="text-sm text-gray-500">{option.description}</p>
                </div>
                <Toggle checked={preferences[option.key]} onChange={(v) => setPreference(option.key, v)} label={option.label} disabled={preferenceSaving} />
              </li>
            ))}
          </ul>
          <p role="status" aria-live="polite" className="mt-4 text-xs text-gray-500">{preferenceSaving ? "Saving your preferences..." : "Changes are saved automatically."}</p>
        </section>

      </div>

    </>
  );
};

const Settings = () => {
  const { isAgent } = useAuth();
  const Shell = isAgent ? AgentSettingsShell : AccountShell;
  return <Shell title={isAgent ? "Account settings" : "Settings"} description="Manage your security and notification preferences."><AccountSettings /></Shell>;
};

export default Settings;
