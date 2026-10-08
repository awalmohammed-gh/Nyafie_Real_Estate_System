import { Link } from "react-router-dom";
import { ArrowUpRight, Heart, MessageCircle, Search, ShieldCheck } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";

const steps = [
  { number: "01", Icon: Search, title: "Find your fit.", description: "Choose your area, your budget and your kind of space. Browse the details at your own pace.", label: "Start exploring", page: "properties" },
  { number: "02", Icon: Heart, title: "Keep the favourites.", description: "Save the homes you love to your account. Come back to your shortlist when you’re ready.", label: "Your saved homes", path: "/account/saved" },
  { number: "03", Icon: MessageCircle, title: "Make a connection.", description: "Contact the agent who posted your home, arrange a viewing, and discuss your rental or negotiate the sale.", label: "Meet the agents", page: "agents" },
];

const HomeJourney = () => {
  const { paths, settings } = usePlatform();
  return (
    <>
      <section className="home-section home-journey" aria-labelledby="journey-heading">
        <div className="container-page">
          <div className="home-section-header"><div><p className="home-eyebrow">03 / FROM BROWSING TO BELONGING</p><h2 id="journey-heading" className="home-section-title">Your next move,<br /><span className="home-serif">made simpler.</span></h2></div><p className="home-journey-intro">A little less searching.<br />A little more imagining life there.</p></div>
          <div className="home-journey-grid">{steps.map(({ number, Icon, title, description, label, page, path }) => (
            <article key={number} className="home-journey-step"><div className="home-step-topline"><span>{number}</span><Icon size={23} strokeWidth={1.5} aria-hidden="true" /></div><h3>{title}</h3><p>{description}</p><Link to={path || paths[page]} className="home-text-link">{label}<ArrowUpRight size={17} aria-hidden="true" /></Link></article>
          ))}</div>
          <div className="home-review-note"><ShieldCheck size={20} aria-hidden="true" /><p>{settings.property.requireApproval ? "Agent listings are reviewed before publication. " : "Agents are approved before they can post. "}Speak with the listing agent and view the property to make sure it’s right for you.</p></div>
        </div>
      </section>
      <section className="home-conversation" aria-labelledby="conversation-heading"><div className="container-page home-conversation-inner"><div><p className="home-eyebrow">LET’S TALK ABOUT YOUR NEXT CHAPTER</p><h2 id="conversation-heading">A home is personal.<br /><span className="home-serif">Finding it should be, too.</span></h2></div><div className="home-conversation-action"><p>Need a little local guidance?<br />Connect with an agent who can help.</p><Link to={paths.agents} className="home-conversation-link">Find your agent <ArrowUpRight size={23} aria-hidden="true" /></Link></div></div></section>
    </>
  );
};

export default HomeJourney;
