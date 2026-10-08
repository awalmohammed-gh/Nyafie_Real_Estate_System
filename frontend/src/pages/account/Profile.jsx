import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, Loader2 } from "lucide-react";
import AccountShell from "../../components/account/AccountShell";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import { formatDate } from "../../utils/date";
import { usePlatform } from "../../context/usePlatform";

const Profile = () => {
  const { siteName } = usePlatform();
  const { user, isAgent, isAdmin, isActive, updateProfile } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, phone: user.phone || "" });
  const [saving, setSaving] = useState(false);

  const dirty = form.firstName !== user.firstName || form.lastName !== user.lastName || form.phone !== (user.phone || "");

  // Admins have no customer profile; their account lives in the admin console
  if (isAdmin) return <Navigate to="/admin/settings" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast({ type: "error", title: "First and last name are required" });
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim() });
      toast({ title: "Profile updated" });
    } catch (err) {
      toast({ type: "error", title: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccountShell title="My Profile" description="Your personal details.">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl bg-white p-6 ring-1 ring-gray-200 sm:p-8 lg:col-span-2">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="mb-1.5 block text-sm font-medium text-gray-700">First name</label>
              <input id="firstName" value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} autoComplete="given-name" className="field" />
            </div>
            <div>
              <label htmlFor="lastName" className="mb-1.5 block text-sm font-medium text-gray-700">Last name</label>
              <input id="lastName" value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} autoComplete="family-name" className="field" />
            </div>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
              <input id="email" value={user.email} disabled className="field bg-gray-50 text-gray-500" />
            </div>
            <div>
              <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>
              <input id="phone" type="tel" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} autoComplete="tel" placeholder="+233 ..." className="field" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-5">
            <p className="text-sm text-gray-500">Member since {formatDate(user.createdAt)}</p>
            <button type="submit" disabled={!dirty || saving} className="btn btn-primary">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </button>
          </div>
        </form>

        <aside className="rounded-3xl bg-white p-6 ring-1 ring-gray-200 sm:p-8">
          <p className="text-sm text-gray-500">Account type</p>
          {isAgent ? (
            <>
              <p className="mt-1 flex items-center gap-2 text-xl font-bold text-gray-900">
                <BadgeCheck className="h-5 w-5 text-brand-500" />
                Agent
              </p>
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-gray-50 p-4 text-sm">
                <span className="font-semibold text-gray-900">{user.subscription?.planName || "No"} plan</span>
                <StatusBadge status={isActive ? "Active" : "Expired"} />
              </div>
              <Link to="/agent/dashboard" className="btn btn-light mt-4 w-full">
                Agent Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <>
              <p className="mt-1 text-xl font-bold text-gray-900">Home seeker</p>
              <p className="mt-3 text-sm text-gray-600">List your own properties and receive inquiries by becoming a {siteName} agent.</p>
              <Link to="/agent/plans" className="btn btn-primary mt-5 w-full">
                Become an Agent
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </aside>
      </div>
    </AccountShell>
  );
};

export default Profile;
