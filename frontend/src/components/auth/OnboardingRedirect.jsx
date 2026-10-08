import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { agentDestination } from "../../utils/sessionDomain";

// /agent/onboarding: continue at the exact step the server reports as next
const OnboardingRedirect = () => {
  const { user } = useAuth();
  return <Navigate to={agentDestination(user)} replace />;
};

export default OnboardingRedirect;
