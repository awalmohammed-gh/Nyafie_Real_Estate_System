import { Link } from "react-router-dom";
import { ArrowUpRight, Building2, Check } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { usePlatform } from "../../context/usePlatform";

const BecomeAgent = () => {
  const { user } = useAuth();
  const { siteName } = usePlatform();
  const isAgent = user?.role === "agent";
  return (
    <section id="become-agent" className="home-section home-agent-cta" aria-labelledby="agent-heading">
      <div className="container-page">
        <div className="home-agent-market-card">
          <div className="home-agent-market-copy">
            <span className="home-agent-market-icon"><Building2 size={24} strokeWidth={1.6} aria-hidden="true" /></span>
            <div>
              <p className="home-eyebrow">FOR AGENTS & AGENCIES</p>
              <h2 id="agent-heading">List and manage your properties.</h2>
              <p>Publish on {siteName}, manage your listings, and respond to enquiries from one dashboard.</p>
              <ul className="home-agent-market-benefits">
                {["Property listings", "Direct enquiries", "Listing management"].map((text) => <li key={text}><Check size={14} aria-hidden="true" />{text}</li>)}
              </ul>
            </div>
          </div>
          <div className="home-agent-market-actions">
            <Link to={isAgent ? "/agent/dashboard" : "/agent/register"} className="home-quiet-button">{isAgent ? "Open dashboard" : "Become an agent"} <ArrowUpRight size={17} aria-hidden="true" /></Link>
            <Link to="/agent/plans" className="home-text-link">View agent plans</Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BecomeAgent;
