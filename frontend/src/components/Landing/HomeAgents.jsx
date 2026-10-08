import { Link } from "react-router-dom";
import { ArrowUpRight, BadgeCheck, Lock, MapPin } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useRealEstate } from "../../context/useRealEstate";
import { usePlatform } from "../../context/usePlatform";
import { usePropertyFacets } from "../../hooks/usePropertyFacets";
import { getInitials } from "../../utils/property";

/**
 * Approved, active agents with live listings. Agent identities are only shared with
 * signed-in accounts (the API enforces this), so visitors see an invitation to sign in instead.
 */
const HomeAgents = () => {
  const { isAuthenticated } = useAuth();
  const { agents, agentsLoading } = useRealEstate();
  const { paths } = usePlatform();
  const facets = usePropertyFacets();
  const total = facets.data?.agents;
  const shown = agents.filter((agent) => agent.verified && agent.propertyCount > 0).sort((a, b) => b.propertyCount - a.propertyCount).slice(0, 4);
  if (isAuthenticated ? !agentsLoading && !shown.length : total === 0) return null;

  return (
    <section className="home-section home-agents" aria-labelledby="agents-heading">
      <div className="container-page">
        <div className="home-section-header">
          <div><p className="home-eyebrow">TRUSTED AGENTS</p><h2 id="agents-heading" className="home-section-title">Meet <span className="home-serif">HomeBase agents.</span></h2></div>
          <div className="home-section-aside"><p>Agents are approved before they can list,<br />and you can contact them directly.</p><Link to={paths.agents} className="home-text-link">All agents <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        </div>
        {!isAuthenticated ? (
          <div className="home-agents-locked">
            <Lock size={22} aria-hidden="true" />
            <div><h3>{total ? `${total.toLocaleString()} approved ${total === 1 ? "agent is" : "agents are"} listing on HomeBase.` : "Approved agents list properties on HomeBase."}</h3><p>Agent profiles and contact details are shared with signed-in members to keep agents safe from spam.</p></div>
            <Link to="/login" state={{ from: paths.agents }} className="home-hero-cta">Sign in to meet agents <ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>
        ) : agentsLoading ? (
          <ul className="home-agents-grid" aria-busy="true" aria-label="Loading agents">{Array.from({ length: 4 }, (_, i) => <li key={i} className="home-agent-card is-loading" />)}</ul>
        ) : (
          <ul className="home-agents-grid">{shown.map((agent) => {
            const area = agent.locations.filter(Boolean)[0] || agent.city;
            return (
              <li key={agent.id} className="home-agent-card">
                <span className="home-agent-avatar">{agent.profileImage ? <img src={agent.profileImage} alt="" loading="lazy" /> : getInitials(agent.name)}</span>
                <h3><Link to={`/agents/${agent.id}`}>{agent.name}</Link>{agent.verified && <BadgeCheck size={16} aria-label="Approved agent" />}</h3>
                {agent.companyName && <p className="home-agent-company">{agent.companyName}</p>}
                {area && <p className="home-agent-area"><MapPin size={13} aria-hidden="true" />{area}</p>}
                <p className="home-agent-listings"><strong>{agent.propertyCount}</strong> active {agent.propertyCount === 1 ? "listing" : "listings"}</p>
                <span className="home-agent-link" aria-hidden="true">View profile <ArrowUpRight size={15} /></span>
              </li>
            );
          })}</ul>
        )}
      </div>
    </section>
  );
};

export default HomeAgents;
