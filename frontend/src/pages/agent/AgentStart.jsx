import { useEffect, useState } from "react";
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import PageLoader from "../../components/ui/PageLoader";
import { useAuth } from "../../context/useAuth";
import { authApi } from "../../frontApi";
import { agentStartDestination, agentStartRedirect } from "../../utils/listProperty";

/**
 * /agent/start: "List your property". Only a customer's own agent account is ever opened here. An agent
 * someone else left signed in on this browser is not: visitors register and customers apply first.
 */
const AgentStart = () => {
  const { user, ready, isAdmin, requestPassword } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const dashboard = params.get("to") === "dashboard";
  const redirect = agentStartRedirect(user);
  const opens = ready && !isAdmin && !redirect;
  const passwordMissing = Boolean(user?.passwordMissing);

  useEffect(() => {
    if (!opens) return undefined;
    let active = true;
    const open = async () => {
      try {
        // Signed up with Google: the agent area needs a NyaFie password
        if (passwordMissing && !(await requestPassword("agent"))) { if (active) navigate("/", { replace: true }); return; }
        const agent = await authApi.becomeAgent();
        if (active) navigate(agentStartDestination(agent, dashboard), { replace: true });
      } catch (err) {
        if (!active) return;
        // Signed in with Google: their agent area opens with the password, at the agent sign-in
        if (err.code === "AGENT_SIGN_IN") navigate("/agent/login", { replace: true, state: { explicitSignIn: true, from: dashboard ? "/agent/dashboard" : "/agent/properties/add" } });
        else setError(err.message);
      }
    };
    open();
    return () => { active = false; };
    // Once per visit: creating the password must not start it again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opens]);

  if (!ready) return <PageLoader label="Checking your account..." />;
  if (redirect) return <Navigate to={redirect} replace state={{ explicitSignIn: true }} />;
  if (error) return (
    <section className="container-page grid min-h-[60vh] place-items-center py-16 text-center">
      <div className="max-w-md" role="alert">
        <AlertCircle className="mx-auto h-9 w-9 text-red-500" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold text-gray-900">Your agent area couldn't be opened</h1>
        <p className="mt-2 text-sm text-gray-600">{error}</p>
        <Link to="/agent/login" className="btn btn-primary mt-6">Sign in as agent</Link>
      </div>
    </section>
  );
  return <PageLoader label="Opening your agent area..." />;
};

export default AgentStart;
