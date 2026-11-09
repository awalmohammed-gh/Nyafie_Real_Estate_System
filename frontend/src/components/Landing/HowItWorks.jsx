import { Link } from "react-router-dom";
import { ArrowUpRight, KeyRound, MessageCircle, Search, ShieldCheck } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";
import { RevealGroup, RevealItem, SectionHeader } from "./LandingMotion";

const steps = [
  { Icon: Search, title: "Search properties", description: "Explore homes, apartments, and short stays based on your location, preferences, and budget." },
  { Icon: MessageCircle, title: "Connect with an agent", description: "Review the details and contact the listing agent to ask questions or arrange a viewing." },
  { Icon: KeyRound, title: "Find your place", description: "Choose what suits you and continue through the available rental, booking, or purchase process." },
];

const HowItWorks = () => {
  const { paths, settings, siteName } = usePlatform();
  return (
    <section className="home-section home-journey" aria-labelledby="journey-heading">
      <div className="container-page">
        <SectionHeader>
          <div><p className="home-eyebrow">HOW {siteName.toUpperCase()} WORKS</p><h2 id="journey-heading" className="home-section-title">From search to viewing</h2></div>
          <div className="home-section-aside"><Link to={paths.agents} className="home-text-link">Meet the agents <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        </SectionHeader>
        <RevealGroup as="ol" className="home-steps" gap={0.06}>{steps.map(({ Icon, title, description }, index) => (
          <RevealItem as="li" key={title} className="home-step">
            <div className="home-step-topline"><span>0{index + 1}</span><span className="home-step-icon"><Icon size={20} strokeWidth={1.75} aria-hidden="true" /></span></div>
            <h3>{title}</h3><p>{description}</p>
          </RevealItem>
        ))}</RevealGroup>
        <div className="home-journey-footer"><p><ShieldCheck size={18} aria-hidden="true" />{settings.property.requireApproval ? "Agent listings are reviewed before publication." : "Agents are approved before they can post."}</p><Link to="/about" className="home-text-link">About {siteName} <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      </div>
    </section>
  );
};

export default HowItWorks;
