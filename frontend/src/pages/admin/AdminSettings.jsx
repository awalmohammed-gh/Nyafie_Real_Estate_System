import { useState } from "react";
import { Bell, Building2, Globe, Save, UserCog, UserRound } from "lucide-react";
import { useAdminData } from "../../hooks/useAdminData";
import { useToast } from "../../context/useToast";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import AdminPageTitle from "../../components/admin/AdminPageTitle";

const Toggle = ({ label, description, checked, onChange }) => (
  <div className="flex items-center justify-between gap-4 py-3">
    <div>
      <p className="text-sm font-semibold text-gray-900">{label}</p>
      {description && <p className="text-sm text-gray-500">{description}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-gray-300"}`}
    >
      <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  </div>
);

const Section = ({ id, icon: Icon, title, description, onSave, dirty, children }) => (
  <section id={id} className="scroll-mt-28 rounded-2xl bg-white ring-1 ring-slate-200">
    <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h2 className="font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </div>
    <div className="px-6 py-5">{children}</div>
    {onSave && (
      <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
        {dirty && <span className="text-sm text-gray-500">Unsaved changes</span>}
        <button onClick={onSave} disabled={!dirty} className="btn btn-primary px-5 py-2.5">
          <Save className="h-4 w-4" />
          Save
        </button>
      </div>
    )}
  </section>
);

const Field = ({ label, children }) => (
  <label className="block text-sm">
    <span className="mb-1.5 block font-medium text-gray-700">{label}</span>
    {children}
  </label>
);

// Section form state that can be saved into the platform settings
const useSectionForm = (initial) => {
  const [form, setForm] = useState(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  return [form, (key, value) => setForm((p) => ({ ...p, [key]: value })), dirty];
};

const AdminSettings = () => {
  const { settings, updateSettings, plans, user, updateProfile } = useAdminData();
  const { toast } = useToast();
  const run = useAsyncAction();
  const [platform, setPlatform, platformDirty] = useSectionForm(settings.platform);
  const [property, setProperty, propertyDirty] = useSectionForm(settings.property);
  const [agent, setAgent, agentDirty] = useSectionForm(settings.agent);
  const [notifications, setNotifications, notificationsDirty] = useSectionForm(settings.notifications);
  const [profile, setProfile, profileDirty] = useSectionForm({ firstName: user.firstName, lastName: user.lastName, phone: user.phone || "" });

  const save = (section, values, label) => run(updateSettings(section, values), { success: `${label} saved` });

  return (
    <>
      <AdminPageTitle title="Settings" description="Platform configuration saved to the server." />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section
          id="profile"
          icon={UserRound}
          title="Admin profile"
          description={user.email}
          dirty={profileDirty}
          onSave={() => {
            if (!profile.firstName.trim() || !profile.lastName.trim()) return toast({ type: "error", title: "Name is required" });
            run(updateProfile({ firstName: profile.firstName.trim(), lastName: profile.lastName.trim(), phone: profile.phone.trim() }), { success: "Profile saved" });
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="First name"><input value={profile.firstName} onChange={(e) => setProfile("firstName", e.target.value)} className="field" /></Field>
            <Field label="Last name"><input value={profile.lastName} onChange={(e) => setProfile("lastName", e.target.value)} className="field" /></Field>
            <Field label="Phone"><input value={profile.phone} onChange={(e) => setProfile("phone", e.target.value)} className="field" /></Field>
          </div>
        </Section>

        <Section id="platform" icon={Globe} title="Platform settings" description="Public details shown across the site." dirty={platformDirty} onSave={() => save("platform", platform, "Platform settings")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Platform name"><input value={platform.name} onChange={(e) => setPlatform("name", e.target.value)} className="field" /></Field>
            <Field label="Contact email"><input type="email" value={platform.email} onChange={(e) => setPlatform("email", e.target.value)} className="field" /></Field>
            <Field label="Phone"><input value={platform.phone} onChange={(e) => setPlatform("phone", e.target.value)} className="field" /></Field>
            <Field label="Currency">
              <select value={platform.currency} onChange={(e) => setPlatform("currency", e.target.value)} className="field">
                <option value="GHS">Ghana cedi (GHS)</option>
                <option value="USD">US dollar (USD)</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Location"><input value={platform.location} onChange={(e) => setPlatform("location", e.target.value)} className="field" /></Field>
            </div>
          </div>
        </Section>

        <Section id="property" icon={Building2} title="Property settings" description="Rules for listings across the platform." dirty={propertyDirty} onSave={() => save("property", { ...property, maxImages: Number(property.maxImages) || 1 }, "Property settings")}>
          <Field label="Maximum images per property (platform cap)">
            <input type="number" min="1" max="50" value={property.maxImages} onChange={(e) => setProperty("maxImages", e.target.value)} className="field max-w-40" />
          </Field>
          <p className="mt-1.5 text-xs text-gray-500">Each plan's image limit applies within this cap.</p>
          <div className="mt-4 divide-y divide-slate-100">
            <Toggle label="Property approval required" description="Agent submissions go to Pending Review before they're published." checked={property.requireApproval} onChange={(v) => setProperty("requireApproval", v)} />
            <Toggle label="Allow agent property publishing" description="When off, agents can only save drafts." checked={property.allowAgentPublishing} onChange={(v) => setProperty("allowAgentPublishing", v)} />
          </div>
        </Section>

        <Section id="agent" icon={UserCog} title="Agent settings" description="How agents join and what they can do." dirty={agentDirty} onSave={() => save("agent", agent, "Agent settings")}>
          <div className="divide-y divide-slate-100">
            <Toggle label="Require subscription" description="When off, agents without an active plan use the default plan's limits." checked={agent.requireSubscription} onChange={(v) => setAgent("requireSubscription", v)} />
            <Toggle label="Manually verify new agents" description="Flag new agents for review (takes effect once the backend is connected)." checked={agent.manualAgentVerification} onChange={(v) => setAgent("manualAgentVerification", v)} />
          </div>
          <div className="mt-4">
            <Field label="Default agent plan">
              <select value={agent.defaultPlan} onChange={(e) => setAgent("defaultPlan", e.target.value)} className="field max-w-60">
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        <Section id="notifications" icon={Bell} title="Notification settings" description="Emails the admin team receives." dirty={notificationsDirty} onSave={() => save("notifications", notifications, "Notification settings")}>
          <div className="divide-y divide-slate-100">
            <Toggle label="Email notifications" description="Master switch for admin emails." checked={notifications.email} onChange={(v) => setNotifications("email", v)} />
            <Toggle label="Inquiry notifications" description="New inquiries on HomeBase listings." checked={notifications.inquiries} onChange={(v) => setNotifications("inquiries", v)} />
            <Toggle label="Subscription notifications" description="New, expiring and failed subscriptions." checked={notifications.subscriptions} onChange={(v) => setNotifications("subscriptions", v)} />
            <Toggle label="Weekly digest" description="A summary of platform activity every Monday." checked={notifications.weeklyDigest} onChange={(v) => setNotifications("weeklyDigest", v)} />
          </div>
        </Section>
      </div>
    </>
  );
};

export default AdminSettings;
