import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import AccountShell from "../../components/account/AccountShell";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";

const notificationOptions = [
  { key: "newListings", label: "New listings", description: "Weekly email with new properties in areas you browse." },
  { key: "inquiryUpdates", label: "Inquiry updates", description: "When an agent responds or an inquiry is updated." },
  { key: "offers", label: "Offers & news", description: "Occasional product news and promotions." },
];

const Toggle = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-gray-200"}`}
  >
    <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
  </button>
);

const Settings = () => {
  const { user, updateProfile, changePassword } = useAuth();
  const { toast } = useToast();
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const preferences = { newListings: true, inquiryUpdates: true, offers: false, ...user.preferences };

  const setPreference = async (key, value) => {
    try {
      await updateProfile({ preferences: { ...preferences, [key]: value } });
      toast({ title: "Preferences saved" });
    } catch (err) {
      toast({ type: "error", title: err.message });
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
    <AccountShell title="Settings" description="Security and notification preferences.">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={handlePassword} className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-gray-200 sm:p-8">
          <h2 className="text-lg font-bold text-gray-900">Change password</h2>
          {[
            ["current", "Current password", "current-password"],
            ["next", "New password", "new-password"],
            ["confirm", "Confirm new password", "new-password"],
          ].map(([key, label, autoComplete]) => (
            <div key={key}>
              <label htmlFor={`pw-${key}`} className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
              <input
                id={`pw-${key}`}
                type="password"
                autoComplete={autoComplete}
                value={passwords[key]}
                onChange={(e) => setPasswords((p) => ({ ...p, [key]: e.target.value }))}
                required
                className="field"
              />
            </div>
          ))}
          {pwError && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {pwError}
            </p>
          )}
          <button type="submit" disabled={pwSaving} className="btn btn-primary">
            {pwSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Update password
          </button>
        </form>

        <section className="rounded-3xl bg-white p-6 ring-1 ring-gray-200 sm:p-8">
          <h2 className="text-lg font-bold text-gray-900">Notifications</h2>
          <ul className="mt-4 divide-y divide-gray-100">
            {notificationOptions.map((option) => (
              <li key={option.key} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p className="font-semibold text-gray-900">{option.label}</p>
                  <p className="text-sm text-gray-500">{option.description}</p>
                </div>
                <Toggle checked={preferences[option.key]} onChange={(v) => setPreference(option.key, v)} label={option.label} />
              </li>
            ))}
          </ul>
        </section>

      </div>

    </AccountShell>
  );
};

export default Settings;
