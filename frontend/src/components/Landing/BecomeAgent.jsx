import { RevealBlock } from "./LandingMotion";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { usePlatform } from "../../context/usePlatform";

const BecomeAgent = () => {
  const { user } = useAuth();
  const { siteName } = usePlatform();
  const isAgent = user?.role === "agent";
  return <RevealBlock as="section" id="become-agent" className="home-agent-cta" aria-labelledby="agent-heading"><div className="container-page home-agent-layout">
    <img className="home-agent-photo" src="/banners/nyafie-agent-consultation.jpg" alt="A property agent discussing a home with a couple" loading="lazy" decoding="async" width="768" height="512" />
    <div className="home-agent-panel">
      <div className="home-agent-copy"><p className="home-eyebrow">FOR AGENTS & PROPERTY OWNERS</p><h2 id="agent-heading">List and grow with {siteName}.</h2><p>Showcase your properties, reach more serious buyers and renters, and manage everything from one dashboard.</p><ul className="home-agent-benefits">{["List properties easily", "Manage inquiries", "Grow your client reach"].map(text => <li key={text}><Check size={15} aria-hidden="true" />{text}</li>)}</ul></div>
      <div className="home-agent-actions"><Link to={isAgent ? "/agent/dashboard" : "/agent/register"} className="home-button home-button-white">{isAgent ? "Open dashboard" : "Become an Agent"}<ArrowRight size={17} aria-hidden="true" /></Link><Link to="/agent/plans" className="home-button home-button-outline">View Plans</Link></div>
    </div>
  </div></RevealBlock>;
};
export default BecomeAgent;
