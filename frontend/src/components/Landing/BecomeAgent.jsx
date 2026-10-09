import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BarChart3,
  BedDouble,
  Building2,
  CreditCard,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Users,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { usePlatform } from "../../context/usePlatform";
import { Reveal, RevealGroup, RevealItem } from "./LandingMotion";

const flow = [
  "Create an agent account",
  "Complete your agent profile",
  "Choose a subscription",
  "Get approved",
  "Start posting properties",
];

const benefits = [
  { Icon: Building2, text: "List multiple properties" },
  { Icon: Users, text: "Reach people searching to rent, buy or stay" },
  { Icon: Inbox, text: "Receive inquiries and messages directly" },
  { Icon: LayoutDashboard, text: "Manage every listing from one dashboard" },
  { Icon: CreditCard, text: "Track your subscription and plan limits" },
  { Icon: Megaphone, text: "Advertise rental and sale properties" },
  { Icon: BedDouble, text: "Manage hotel rooms and bookings" },
  { Icon: BarChart3, text: "See views, offers and rental requests" },
];

const BecomeAgent = () => {
  const { user } = useAuth();
  const { plans } = usePlatform();
  const isAgent = user?.role === "agent";
  const cheapest = plans
    .filter((plan) => plan.active !== false)
    .sort((a, b) => a.price - b.price)[0];

  return (
    <section
      id="become-agent"
      className="home-section home-agent-cta"
      aria-labelledby="agent-heading"
    >
      <div className="container-page home-agent-layout">
        <RevealGroup className="home-agent-copy">
          <RevealItem as="p" className="home-eyebrow">07 / HAVE A PROPERTY TO LIST?</RevealItem>
          <RevealItem as="h2" id="agent-heading" className="home-section-title">
            Become a <span className="home-serif">HomeBase agent.</span>
          </RevealItem>
          <RevealItem as="p" className="home-agent-lead">
            Join HomeBase, subscribe to an agent plan and start reaching people
            looking for properties to rent, buy or book.
          </RevealItem>
          <RevealItem as="p" className="home-agent-rule">
            Properties can’t be posted anonymously — to list yours, you join as
            an approved HomeBase agent.
          </RevealItem>
          <RevealItem className="home-hero-actions">
            {isAgent ? (
              <Link to="/agent/dashboard" className="home-hero-cta is-light">
                Go to your dashboard{" "}
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            ) : (
              <Link to="/agent/register" className="home-hero-cta is-light">
                Become an agent <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            )}
            <Link to="/agent/plans" className="home-hero-cta is-ghost">
              {cheapest ? "See agent plans" : "Learn more"}
            </Link>
          </RevealItem>
          {cheapest && (
            <RevealItem as="p" className="home-agent-price">
              Plans from{" "}
              <strong>
                {cheapest.price
                  ? `₵${cheapest.price.toLocaleString()}`
                  : "free"}
              </strong>
              {cheapest.durationDays
                ? ` for ${cheapest.durationDays} days`
                : ""}
            </RevealItem>
          )}
        </RevealGroup>
        <Reveal className="home-agent-panel" delay={0.15}>
          <h3>How it works</h3>
          <RevealGroup as="ol" className="home-agent-flow" gap={0.08} delay={0.3}>
            {flow.map((step, index) => (
              <RevealItem as="li" key={step}>
                <span>{index + 1}</span>
                {step}
              </RevealItem>
            ))}
          </RevealGroup>
          <h3>What you get</h3>
          <RevealGroup as="ul" className="home-agent-benefits" gap={0.05}>
            {benefits.map(({ Icon, text }) => (
              <RevealItem as="li" key={text}>
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                {text}
              </RevealItem>
            ))}
          </RevealGroup>
        </Reveal>
      </div>
    </section>
  );
};

export default BecomeAgent;
