import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Bell, Check, Loader2, MapPin, Save, Settings2, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import { useRealEstate } from "../../context/useRealEstate";
import { agentApplicationApi } from "../../frontApi";
import AgentProfileFields from "../../components/agent/AgentProfileFields";
import { agentProfileForm } from "../../utils/agentProfile";
import PageTitle from "../../components/agent/PageTitle";
import { AccountSettings } from "../account/Settings";
import { getInitials } from "../../utils/property";
import { cloudImage } from "../../utils/cloudImage";

const SECTIONS = [
  { id: "profile", label: "Profile", description: "Your professional details", icon: UserRound },
  { id: "security", label: "Security", description: "Password and account access", icon: ShieldCheck },
  { id: "notifications", label: "Notifications", description: "Updates you want to receive", icon: Bell },
];
const PROFILE_FIELDS = ["firstName", "lastName", "phone", "whatsapp", "agentType", "companyName", "region", "city", "officeAddress", "ghanaPostGPS", "yearsExperience", "bio", "agencyLogo", "profileImage"];

const ProfileForm = ({ user }) => {
  const { refreshUser } = useAuth();
  const { refreshProperties } = useRealEstate();
  const { toast } = useToast();
  const [form, setForm] = useState(() => agentProfileForm(user));
  const [savedForm, setSavedForm] = useState(() => agentProfileForm(user));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const dirty = PROFILE_FIELDS.some((key) => String(form[key] ?? "") !== String(savedForm[key] ?? ""));
  const name = `${form.firstName} ${form.lastName}`.trim();
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const updated = await agentApplicationApi.updateAgentProfile(form);
      const saved = agentProfileForm(updated);
      setForm(saved);
      setSavedForm(saved);
      await Promise.all([refreshUser(), refreshProperties()]);
      toast({ title: "Your agent profile is updated" });
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const profilePreview = <div className="settings-profile-preview">
      <div className="settings-profile-avatar">{form.profileImage ? <img src={cloudImage(form.profileImage, 96)} alt="Your profile preview" /> : getInitials(name)}</div>
      <div className="min-w-0 flex-1">
        <p className="workspace-eyebrow">Your public identity</p>
        <h3 className="mt-2 break-words text-xl font-semibold tracking-tight text-gray-900">{name || "Your name"}</h3>
        <p className="mt-1 break-words text-sm text-gray-500">{form.agentType === "agency" ? form.companyName || "Your agency" : "Independent real estate agent"}</p>
        {(form.city || form.region) && <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-gray-500"><MapPin className="h-3.5 w-3.5 shrink-0" />{[form.city, form.region].filter(Boolean).join(", ")}</p>}
      </div>
      <span className="settings-preview-label">Live preview</span>
    </div>;
  return <form onSubmit={save} className="settings-profile-form space-y-5">
    <AgentProfileFields form={form} setForm={setForm} email={user.email} disabled={saving} onUploadingChange={setUploading} photoFirst profilePreview={profilePreview} typeLocked teamAgency={user.agency ? user.agency.name || "your agency" : ""} />
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <div className="settings-save-bar">
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-gray-500">{dirty ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" /> : <Check className="h-4 w-4 shrink-0 text-brand-600" />}{uploading ? "Preparing your image..." : saving ? "Saving your profile..." : dirty ? "You have unsaved changes" : "Your profile is up to date"}</p>
      <div className="settings-save-actions"><button type="button" disabled={saving || uploading || !dirty} onClick={() => { setForm(savedForm); setError(""); }} className="btn btn-light">Discard</button><button type="submit" disabled={saving || uploading || !dirty} className="btn btn-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save changes</button></div>
    </div>
  </form>;
};

const Profile = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const requested = params.get("section") || (hash === "#account-settings" ? "security" : "profile");
  const active = SECTIONS.some((section) => section.id === requested) ? requested : "profile";
  const selectSection = (id) => {
    const next = new URLSearchParams(params);
    next.set("section", id);
    setParams(next);
  };
  return <div className="agent-settings-page">
    <PageTitle title="Settings" description="Your professional presence and account preferences, all in one place." eyebrow="Your account" action={<Link to={`/agent/${user.id}`} className="btn btn-light">View public profile<ArrowUpRight className="h-4 w-4" /></Link>} />
    <div className="settings-layout">
      <aside className="settings-section-menu">
        <p className="settings-menu-heading"><Settings2 className="h-3.5 w-3.5" />Account preferences</p>
        <nav aria-label="Settings sections" className="settings-section-nav">
          {SECTIONS.map(({ id, label, description, icon: Icon }) => <button key={id} type="button" aria-pressed={active === id} aria-controls={`settings-${id}`} onClick={() => selectSection(id)} className={`settings-section-link ${active === id ? "is-active" : ""}`}><Icon className="h-5 w-5 shrink-0" /><span className="min-w-0"><span className="settings-section-label">{label}</span><span className="settings-section-description">{description}</span></span></button>)}
        </nav>
        <div className="settings-account-note"><span className="settings-account-status"><ShieldCheck className="h-4 w-4" />Approved agent</span><p className="mt-3 text-xs text-gray-400">Signed in as</p><p className="mt-1 break-all text-xs leading-relaxed text-gray-600">{user.email}</p></div>
      </aside>
      <div className="settings-main">
        <section id="settings-profile" hidden={active !== "profile"} aria-labelledby="settings-profile-title">
          <header className="settings-section-header"><h2 id="settings-profile-title">Professional profile</h2><p>Help customers get to know you and the areas you serve.</p></header>
          <ProfileForm key={user.id} user={user} />
        </section>
        <div hidden={active === "profile"}><AccountSettings activeSection={active} showAccountSummary={false} /></div>
      </div>
    </div>
  </div>;
};
export default Profile;
