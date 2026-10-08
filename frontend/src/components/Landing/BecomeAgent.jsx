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
        <div className="home-agent-copy">
          <p className="home-eyebrow">07 / HAVE A PROPERTY TO LIST?</p>
          <h2 id="agent-heading" className="home-section-title">
            Become a <span className="home-serif">HomeBase agent.</span>
          </h2>
          <p className="home-agent-lead">
            Join HomeBase, subscribe to an agent plan and start reaching people
            looking for properties to rent, buy or book.
          </p>
          <p className="home-agent-rule">
            Properties can’t be posted anonymously — to list yours, you join as
            an approved HomeBase agent.
          </p>
          <div className="home-hero-actions">
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
          </div>
          {cheapest && (
            <p className="home-agent-price">
              Plans from{" "}
              <strong>
                {cheapest.price
                  ? `₵${cheapest.price.toLocaleString()}`
                  : "free"}
              </strong>
              {cheapest.durationDays
                ? ` for ${cheapest.durationDays} days`
                : ""}
            </p>
          )}
        </div>
        <div className="home-agent-panel">
          <h3>How it works</h3>
          <ol className="home-agent-flow">
            {flow.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <h3>What you get</h3>
          <ul className="home-agent-benefits">
            {benefits.map(({ Icon, text }) => (
              <li key={text}>
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default BecomeAgent;
