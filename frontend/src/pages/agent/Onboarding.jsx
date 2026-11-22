import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { agentApplicationApi } from "../../frontApi";
import { canAccessAgent } from "../../utils/sessionDomain";
import OnboardingProgress from "../../components/agent/OnboardingProgress";
import AgentProfileFields from "../../components/agent/AgentProfileFields";
import AgentProofDocuments from "../../components/agent/AgentProofDocuments";
import { agentProfileForm } from "../../utils/agentProfile";

const ApplicationForm = ({ user }) => {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => agentProfileForm(user));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofCount, setProofCount] = useState(user.agentApplication?.proofCount || 0);
  const [error, setError] = useState("");
  const needsSubscription = user.onboarding?.requireSubscription !== false && !["active", "not_required"].includes(user.onboarding?.subscription);
  const submit = async (event) => {
    event.preventDefault();
    if (!proofCount || proofUploading) return setError("Upload at least one professional proof document before continuing.");
    setBusy(true); setError("");
    try {
      await agentApplicationApi.saveApplication(form);
      const { user: fresh } = await agentApplicationApi.getApplication();
      await refreshUser();
      navigate(fresh.onboarding?.nextPath || "/agent/status", { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="mt-8 space-y-5"><AgentProfileFields form={form} setForm={setForm} email={user.email} disabled={busy} typeLocked={Boolean(user.agency)} onUploadingChange={setUploading} /><AgentProofDocuments disabled={busy} onCountChange={setProofCount} onBusyChange={setProofUploading} />{error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}<div className="workspace-billing-summary flex flex-col gap-4 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-sm text-xs leading-relaxed text-gray-500">{needsSubscription ? "Next: choose a plan and complete payment. Your application then goes to our team for review." : "Your profile and proof documents will be submitted for admin review. We'll notify you when it's approved."}</p><button type="submit" disabled={busy || uploading || proofUploading || !proofCount} className="btn btn-primary shrink-0">{busy || uploading || proofUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{needsSubscription ? "Continue to subscription" : "Submit for review"}</button></div></form>;
};
const Onboarding = () => {
  const { user } = useAuth();
  if (canAccessAgent(user)) return <Navigate to="/agent/dashboard" replace />;
  if (user.status === "suspended" || (user.agentApplication?.status === "suspended" || (user.agentApplication?.status === "pending" && user.agentApplication?.proofCount > 0))) return <Navigate to="/agent/status" replace />;
  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12"><OnboardingProgress onboarding={user.onboarding} /><div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between"><div className="max-w-xl"><p className="workspace-eyebrow">Step {user.onboarding?.paymentFirst && user.onboarding?.requireSubscription !== false ? "3" : "2"} · Your agent profile</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">Let's introduce you.</h1><p className="mt-3 text-sm leading-relaxed text-gray-500">{user.customerAccess ? "Your existing account details are already filled in. Add your professional information to complete your agent profile." : "Tell us about your work and the places you know. These details help customers choose the right agent."}</p></div><div className="flex max-w-xs items-start gap-3 rounded-xl bg-brand-50 p-4 text-xs leading-relaxed text-brand-800"><ShieldCheck className="h-5 w-5 shrink-0" /><p>Dashboard access opens after admin approval.<Link to="/agent/status" className="mt-2 block font-semibold underline underline-offset-4">View onboarding status</Link></p></div></div><ApplicationForm key={user.id} user={user} /></div>;
};
export default Onboarding;
