import { Link } from "react-router-dom";
import { ArrowUpRight, Eye, KeyRound, MessageCircle, Search, ShieldCheck } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";

const steps = [
  { Icon: Search, title: "Search", description: "Filter by location, property type, price and whether you want to rent, buy or stay." },
  { Icon: Eye, title: "Explore", description: "View photos, details, amenities, reviews and the agent who listed the property." },
  { Icon: MessageCircle, title: "Connect", description: "Send an inquiry or message the agent on HomeBase — or call, email or WhatsApp where listed." },
  { Icon: KeyRound, title: "Rent, buy or book", description: "Make an offer, request a rental or book a hotel room, and follow it from your account." },
];

const HowItWorks = () => {
  const { paths, settings } = usePlatform();
  return (
    <section className="home-section home-journey" aria-labelledby="journey-heading">
      <div className="container-page">
        <div className="home-section-header">
          <div><p className="home-eyebrow">04 / HOW HOMEBASE WORKS</p><h2 id="journey-heading" className="home-section-title">Finding a property <span className="home-serif">should be simple.</span></h2></div>
          <div className="home-section-aside"><p>Four steps from first search to moving in.</p><Link to={paths.listings} className="home-text-link">Start searching <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        </div>
        <ol className="home-steps">{steps.map(({ Icon, title, description }, index) => (
          <li key={title} className="home-step">
            <div className="home-step-topline"><span>0{index + 1}</span><span className="home-step-icon"><Icon size={20} strokeWidth={1.75} aria-hidden="true" /></span></div>
            <h3>{title}</h3>
            <p>{description}</p>
          </li>
        ))}</ol>
        <div className="home-review-note"><ShieldCheck size={20} aria-hidden="true" /><p>{settings.property.requireApproval ? "Agent listings are reviewed before publication. " : "Agents are approved before they can post. "}Speak with the listing agent and view the property to make sure it’s right for you.</p></div>
      </div>
    </section>
  );
};

export default HowItWorks;
