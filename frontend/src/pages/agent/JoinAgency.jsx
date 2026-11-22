import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Building2, Loader2, LogIn, UserPlus, Users } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useApiQuery } from "../../hooks/useApiQuery";
import { teamApi } from "../../frontApi";
import PageLoader from "../../components/ui/PageLoader";
import { formatDate } from "../../utils/date";
import { cloudImage } from "../../utils/cloudImage";

const ROLE_COPY = {
  manager: "As a manager you'll see every agency listing and lead, and assign work to the team.",
  agent: "As an agent you'll handle the listings and leads assigned to you, and can add your own listings for the team.",
};

// /agent/join/:token — an agency invite link. Agents sign in (or sign up) with their own account and join.
const JoinAgency = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const invite = useApiQuery(`invite:${token}`, () => teamApi.viewInvite(token));
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const here = `/agent/join/${token}`;
  const isAgent = user?.role === "agent";

  const join = async () => {
    setJoining(true);
    setError("");
    try {
      const joined = await teamApi.acceptInvite(token);
      await refreshUser();
      navigate(joined.onboarding?.nextPath || "/agent/status", { replace: true });
    } catch (err) {
      setError(err.message);
      setJoining(false);
    }
  };

  if (invite.loading) return <PageLoader label="Opening your invite..." />;
  return (
    <section className="grid min-h-[70vh] place-items-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl ring-1 ring-gray-100 sm:p-10">
        {invite.error ? (
          <>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-500"><AlertCircle className="h-6 w-6" /></span>
            <h1 className="mt-5 text-xl font-bold text-gray-900">This invite can’t be used</h1>
            <p className="mt-2 text-sm text-gray-600">{invite.error}</p>
            <Link to="/" className="btn btn-light mt-6">Go to the homepage</Link>
          </>
        ) : (
          <>
            <span className="mx-auto grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-brand-50 text-brand-600">
              {invite.data.agency.logo ? <img src={cloudImage(invite.data.agency.logo, 64)} alt="" className="h-full w-full object-contain" /> : <Building2 className="h-7 w-7" />}
            </span>
            <p className="mt-5 text-xs font-bold tracking-wider text-brand-700 uppercase">Team invite</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-gray-900">Join {invite.data.agency.name} on NyaFie</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">{ROLE_COPY[invite.data.role]}</p>
            <p className="mt-2 text-xs text-gray-400">Invite expires {formatDate(invite.data.expiresAt)}</p>

            {error && <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-left text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

            {isAgent ? (
              <>
                <button type="button" onClick={join} disabled={joining} className="btn btn-primary mt-7 w-full py-3.5">
                  {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  {joining ? "Joining..." : `Join as ${invite.data.role === "manager" ? "a manager" : "an agent"}`}
                </button>
                <p className="mt-3 text-xs text-gray-500">Signed in as {user.email}. You’ll work under their plan, so you won’t need a subscription of your own.</p>
              </>
            ) : (
              <div className="mt-7 grid gap-3">
                <Link to="/agent/register" state={{ from: here }} className="btn btn-primary w-full py-3.5"><UserPlus className="h-4 w-4" />Create your agent account</Link>
                <Link to="/agent/login" state={{ from: here }} className="btn btn-light w-full py-3.5"><LogIn className="h-4 w-4" />I already have an agent account</Link>
                <p className="text-xs text-gray-500">Use your own email and password. This link brings you back here to join.</p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default JoinAgency;
