import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { authApi } from "../../frontApi";
import { agentDestination } from "../../utils/sessionDomain";
import { adminPath } from "../../utils/adminEntry";

const FreeAgentAccess = () => {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const provider = user?.role === "agent" || user?.agentAccess;
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const agent = await authApi.becomeAgent();
      navigate(agentDestination(agent));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="container-page py-16 sm:py-24">
      <div className="mx-auto max-w-2xl rounded-3xl border border-brand-100 bg-white p-7 sm:p-12">
        <ShieldCheck className="h-12 w-12 text-brand-700" aria-hidden="true" />
        <p className="mt-6 text-sm font-semibold text-brand-700">Free agent access</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Start your agent journey.</h1>
        <p className="mt-5 leading-7 text-gray-600">Agent subscriptions are currently switched off. Apply with your professional information and proof documents. Once our team approves your application, you can use the agent workspace without buying a plan.</p>
        <ul className="my-8 space-y-4 text-sm text-gray-700">
          {["Complete your agent or agency profile", "Upload proof that you work as an agent", "Get approved and start managing your properties"].map(text => <li key={text} className="flex items-start gap-3"><CheckCircle2 size={19} className="shrink-0 text-brand-700" aria-hidden="true" />{text}</li>)}
        </ul>
        {error && <p role="alert" className="mb-5 text-sm text-red-700">{error}</p>}
        {isAdmin ? <Link to={adminPath("/settings?tab=agents")} className="btn btn-primary">Manage agent access</Link>
          : provider ? <Link to={agentDestination(user)} className="btn btn-primary">{user?.agentApplication?.status === "approved" ? "Open workspace" : "Continue application"}<ArrowRight size={18} /></Link>
            : !isAuthenticated ? <Link to="/agent/register" className="btn btn-primary">Become an agent<ArrowRight size={18} /></Link>
              : <button type="button" onClick={start} disabled={busy} className="btn btn-primary">{busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}Start your application</button>}
        <p className="mt-5 text-xs leading-6 text-gray-500">No payment is required while subscriptions are off. Workspace features and listing limits are set by the platform.</p>
      </div>
    </section>
  );
};
export default FreeAgentAccess;
