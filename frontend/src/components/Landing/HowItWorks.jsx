import { House, Search, UsersRound } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";

const steps = [
  { Icon: Search, title: "Search", description: "Find homes, apartments, and stays based on location, budget, and your needs." },
  { Icon: UsersRound, title: "Connect", description: "Talk directly with the listing agent or owner to ask questions or schedule a viewing." },
  { Icon: House, title: "Move In", description: "Choose the right property and proceed with the rental, booking, or purchase process." },
];
const HowItWorks = () => {
  const { siteName } = usePlatform();
  return <section className="home-section home-journey" aria-labelledby="journey-heading"><div className="container-page home-journey-layout">
    <div><p className="home-eyebrow">HOW {siteName.toUpperCase()} WORKS</p><h2 id="journey-heading" className="home-section-title">From search to moving in</h2><p className="home-section-description">A simple, reliable way to find and secure your next property.</p></div>
    <ol className="home-steps">{steps.map(({ Icon, title, description }, index) => <li key={title} className="home-step"><span className="home-step-icon"><Icon size={24} strokeWidth={1.7} aria-hidden="true" /></span><h3>0{index + 1}. {title}</h3><p>{description}</p></li>)}</ol>
  </div></section>;
};
export default HowItWorks;
