import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck } from "lucide-react";
import AgentAvatar from "../agent/AgentAvatar";
import { useAuth } from "../../context/useAuth";
import { usePlatform } from "../../context/usePlatform";
import { useRealEstate } from "../../context/useRealEstate";
import { homesLabel } from "../../utils/homeRows";
import { RevealBlock, RevealGroup, RevealItem } from "./LandingMotion";

// Agent profiles are for signed-in visitors only, so guests don't see this row
const HomeAgents = () => {
  const { isAuthenticated } = useAuth();
  const { paths } = usePlatform();
  const { agents } = useRealEstate();
  const shown = isAuthenticated ? [...agents].filter((agent) => agent.propertyCount > 0).sort((a, b) => b.propertyCount - a.propertyCount || a.name.localeCompare(b.name)).slice(0, 4) : [];
  if (!shown.length) return null;
  return (
    <section className="home-section home-agents" aria-labelledby="home-agents-heading">
      <div className="container-page">
        <RevealBlock as="header" className="home-row-heading"><div><h2 id="home-agents-heading" className="home-section-title">Meet our agents</h2><p className="home-section-description">Approved professionals with homes listed now.</p></div><Link to={paths.agents} className="home-text-link">View all agents<ArrowRight size={18} aria-hidden="true" /></Link></RevealBlock>
        <RevealGroup as="ul" className="home-agent-list" gap={0.06}>{shown.map((agent) => (
          <RevealItem as="li" variant="fade" key={agent.id}><Link to={`${paths.agents}/${agent.id}`} className="home-agent">
            <AgentAvatar name={agent.name} image={agent.profileImage} />
            <span><strong>{agent.name}{agent.verified && <BadgeCheck size={16} role="img" aria-label="Approved agent" />}</strong><small>{[homesLabel(agent.propertyCount), agent.locations.filter(Boolean)[0]].filter(Boolean).join(" · ")}</small></span>
          </Link></RevealItem>
        ))}</RevealGroup>
      </div>
    </section>
  );
};

export default HomeAgents;
