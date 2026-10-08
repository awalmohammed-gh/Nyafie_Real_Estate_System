import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import BrandLogo from "../brand/BrandLogo";
import { usePlatform } from "../../context/usePlatform";
import heroImage from "../../assets/heroBg2.jpg";
import "./auth.css";

const stories = {
  customer: {
    label: "A better way to find home",
    title: <>Your next chapter<br />starts here.</>,
    description: "Discover spaces that feel like you. Keep the homes you love and the conversations that matter, all in one place.",
    perks: ["Save your favourite properties", "Connect directly with agents", "Keep track of every inquiry"],
    footnote: "Find a place. Make it yours.",
  },
  agent: {
    label: "For real estate professionals",
    title: <>Build connections.<br />Open more doors.</>,
    description: "Bring your properties, clients, and ambitions together in a workspace built for your next move.",
    perks: ["Create your professional profile", "Showcase your property listings", "Manage conversations in one place"],
    footnote: "Your business. Room to grow.",
  },
  admin: {
    label: "Behind every great marketplace",
    title: <>A clear view.<br />A better experience.</>,
    description: "Bring people, properties, and decisions together. Everything you need to keep the marketplace moving.",
    perks: ["Review agent applications", "Oversee properties and accounts", "Manage your platform settings"],
    footnote: "Built for thoughtful oversight.",
  },
};

const AuthLayout = ({ domain = "customer", children }) => {
  const { siteName } = usePlatform();
  const reduceMotion = useReducedMotion();
  const story = stories[domain];

  return (
    <div className={`auth-shell auth-shell-${domain}`}>
      <aside className="auth-story" aria-label={`${siteName} introduction`}>
        <img src={heroImage} alt="" className="auth-story-image" />
        <div className="auth-story-overlay" />
        <Link to="/" className="auth-story-brand"><BrandLogo tone="violet" size="lg" /></Link>
        <div className="auth-story-content">
          <span className="auth-story-tag"><span aria-hidden="true" />{story.label}</span>
          <h2>{story.title}</h2>
          <p>{story.description}</p>
          <ul>{story.perks.map((perk) => <li key={perk}><Check size={16} aria-hidden="true" />{perk}</li>)}</ul>
        </div>
        <div className="auth-story-bottom"><span>{story.footnote}</span><ArrowUpRight size={20} aria-hidden="true" /></div>
      </aside>

      <main className="auth-main">
        <header className="auth-topbar">
          <Link to="/" className="auth-mobile-brand"><BrandLogo size="sm" /></Link>
          <Link to="/" className="auth-back"><ArrowLeft size={16} aria-hidden="true" />Back to website</Link>
          <span className="auth-access-label"><ShieldCheck size={16} aria-hidden="true" />{domain === "admin" ? "Administrator access" : "Account access"}</span>
        </header>
        <div className="auth-content">
          <motion.section className="auth-card" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
            {children}
          </motion.section>
          {domain !== "admin" && <p className="auth-admin-link">Managing the platform? <Link to="/admin/login">Admin sign in<ArrowUpRight size={13} aria-hidden="true" /></Link></p>}
        </div>
        <footer className="auth-footer">© {new Date().getFullYear()} {siteName}. All rights reserved.</footer>
      </main>
    </div>
  );
};

export default AuthLayout;
