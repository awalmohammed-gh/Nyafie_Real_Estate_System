import { useContext, useEffect, useState } from "react";
import { Eye, EyeOff, Info } from "lucide-react";
import { useAuth } from "../../../context/useAuth";
import { useToast } from "../../../context/useToast";
import { adminApi } from "../../../frontApi";
import { UnsavedContext } from "../../../hooks/useSettingsForm";
import { Callout, Panel, Row, SaveBar } from "../../../components/admin/settings/SettingsUI";
import { getInitials } from "../../../utils/property";

// Reports unsaved edits to the settings page (tab switch / leave warnings)
const useTrackUnsaved = (id, dirty) => {
  const unsaved = useContext(UnsavedContext);
  useEffect(() => {
    if (!unsaved) return undefined;
    if (dirty) unsaved.add(id);
    else unsaved.delete(id);
    return () => unsaved.delete(id);
  }, [dirty, id, unsaved]);
};

const PasswordInput = ({ id, value, onChange, autoComplete }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className="field pr-11" />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 hover:text-gray-700">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};

// Save state shaped like useSettingsForm, so both forms share the SaveBar
const useFormState = (initial) => {
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const set = (key, value) => {
    setForm((p) => ({ ...p, [key]: value }));
    setStatus("idle");
    setError("");
  };
  const run = async (request, { toast, success, after }) => {
    setStatus("saving");
    setError("");
    try {
      await request();
      setStatus("saved");
      toast({ title: success });
      after?.();
    } catch (err) {
      setStatus("error");
      setError(err.message);
      toast({ type: "error", title: "Failed to save", description: err.message });
    }
  };
  return { form, setForm, set, status, setStatus, error, setError, run };
};

const ProfileForm = () => {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const initial = { firstName: user.firstName, lastName: user.lastName, phone: user.phone || "", email: user.email, currentPassword: "" };
  const s = useFormState(initial);
  const emailChanged = s.form.email.trim().toLowerCase() !== user.email;
  const dirty = ["firstName", "lastName", "phone", "email"].some((k) => s.form[k] !== initial[k]);
  useTrackUnsaved("account-profile", dirty);

  const save = () => {
    if (!s.form.firstName.trim() || !s.form.lastName.trim()) {
      s.setStatus("error");
      s.setError("First and last name are required.");
      return;
    }
    if (emailChanged && !s.form.currentPassword) {
      s.setStatus("error");
      s.setError("Enter your current password to change your sign-in email.");
      return;
    }
    s.run(() => adminApi.updateAccount(s.form).then(refreshUser), {
      toast,
      success: "Account updated",
      after: () => s.setForm((p) => ({ ...p, currentPassword: "" })),
    });
  };

  return (
    <Panel
      title="Personal details"
      description="Your own admin account. These details are private to the admin console."
      footer={<SaveBar form={{ dirty, status: s.status, error: s.error, save, reset: () => s.setForm(initial) }} />}
    >
      <div className="flex items-center gap-4 px-5 py-5 sm:px-6">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-500 text-lg font-bold text-white">{getInitials(user.name)}</span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{user.name}</p>
          <p className="truncate text-sm text-gray-500">{user.email} · Administrator</p>
        </div>
      </div>
      <Row label="Name" htmlFor="acc-first">
        <div className="grid gap-3 sm:grid-cols-2">
          <input id="acc-first" aria-label="First name" value={s.form.firstName} onChange={(e) => s.set("firstName", e.target.value.slice(0, 50))} autoComplete="given-name" className="field" />
          <input aria-label="Last name" value={s.form.lastName} onChange={(e) => s.set("lastName", e.target.value.slice(0, 50))} autoComplete="family-name" className="field" />
        </div>
      </Row>
      <Row label="Phone" htmlFor="acc-phone">
        <input id="acc-phone" type="tel" value={s.form.phone} onChange={(e) => s.set("phone", e.target.value.slice(0, 30))} autoComplete="tel" className="field" />
      </Row>
      <Row label="Sign-in email" description="The email you use at the admin sign-in page." htmlFor="acc-email">
        <input id="acc-email" type="email" value={s.form.email} onChange={(e) => s.set("email", e.target.value)} autoComplete="email" className="field" />
        {emailChanged && (
          <div className="mt-3">
            <label htmlFor="acc-current" className="mb-1.5 block text-sm font-medium text-gray-700">Current password (required to change your email)</label>
            <PasswordInput id="acc-current" value={s.form.currentPassword} onChange={(v) => s.set("currentPassword", v)} autoComplete="current-password" />
          </div>
        )}
      </Row>
    </Panel>
  );
};

const PasswordForm = () => {
  const { changePassword } = useAuth();
  const { toast } = useToast();
  const empty = { current: "", next: "", confirm: "" };
  const s = useFormState(empty);
  const dirty = Object.values(s.form).some(Boolean);
  useTrackUnsaved("account-password", dirty);

  const save = () => {
    let problem = "";
    if (!s.form.current) problem = "Enter your current password.";
    else if (s.form.next.length < 8) problem = "Your new password needs at least 8 characters.";
    else if (s.form.next !== s.form.confirm) problem = "The new passwords don't match.";
    else if (s.form.next === s.form.current) problem = "Choose a password different from your current one.";
    if (problem) {
      s.setStatus("error");
      s.setError(problem);
      return;
    }
    s.run(() => changePassword(s.form.current, s.form.next), { toast, success: "Password changed", after: () => s.setForm(empty) });
  };

  return (
    <Panel
      title="Password"
      description="Change the password you sign in with. You'll stay signed in on this device."
      footer={<SaveBar form={{ dirty, status: s.status, error: s.error, save, reset: () => s.setForm(empty) }} label="Change Password" />}
    >
      <Row label="Current password" htmlFor="pw-current">
        <PasswordInput id="pw-current" value={s.form.current} onChange={(v) => s.set("current", v)} autoComplete="current-password" />
      </Row>
      <Row label="New password" description="At least 8 characters." htmlFor="pw-new">
        <PasswordInput id="pw-new" value={s.form.next} onChange={(v) => s.set("next", v)} autoComplete="new-password" />
      </Row>
      <Row label="Confirm new password" htmlFor="pw-confirm">
        <PasswordInput id="pw-confirm" value={s.form.confirm} onChange={(v) => s.set("confirm", v)} autoComplete="new-password" />
      </Row>
    </Panel>
  );
};

export const AccountTab = () => (
  <div className="space-y-6">
    <ProfileForm />
    <PasswordForm />
    <Callout icon={Info}>
      ADMIN_EMAIL and ADMIN_PSD in backend/.env are only used to create the first admin account. After that, the details above are the ones that count.
      If you forget your password, run <code className="rounded bg-white px-1 py-0.5 text-xs ring-1 ring-slate-200">npm run admin:reset</code> in the backend folder to set it back to ADMIN_PSD.
    </Callout>
  </div>
);
