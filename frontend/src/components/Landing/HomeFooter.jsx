import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import BrandLogo from "../brand/BrandLogo";
import SocialLinks from "../brand/SocialLinks";
import InstallAppButton from "../ui/InstallAppButton";
import { usePlatform } from "../../context/usePlatform";
import { sendMessage } from "../../frontApi/contactApi";

const HomeFooter = () => {
  const { paths, settings, siteName } = usePlatform();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const submitUpdates = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setFeedback(""); setFailed(false);
    try {
      await sendMessage({ name: "Property updates request", email: email.trim(), subject: "Property updates", message: `Please send me property updates and opportunities from ${siteName}. This request was submitted through the website updates form.` });
      setFeedback("Your request has been sent to our team."); setEmail("");
    } catch (error) { setFailed(true); setFeedback(error.message || "We could not send your request. Please try again."); }
    finally { setBusy(false); }
  };
  const groups = [
    { title: "Explore", links: [["Home", "/"], ["All Listings", paths.listings], ["Buy a Home", `${paths.listings}?status=Sale`], ["Rent a Home", `${paths.listings}?status=Rent`], ["Short Stays", `${paths.listings}?type=Hotel,Hotel-Apartment`]] },
    { title: "For Agents", links: [["Become an Agent", "/agent/register"], ["Agent Login", "/agent/login"], ["Subscription Plans", "/agent/plans"]] },
    { title: "Company", links: [[`About ${siteName}`, "/about"], ["Contact Us", "/contact"]] },
  ];
  return <footer className="home-reference-footer"><div className="container-page">
    <div className="home-footer-grid">
      <div className="home-footer-brand"><Link to="/" aria-label={`${siteName} home`}><BrandLogo tone="dark" variant="reference" /></Link><p>{settings.general.description}</p><SocialLinks social={settings.social} className="home-footer-socials" /></div>
      {groups.map(({ title, links }) => <nav key={title} aria-label={title}><h2>{title}</h2><ul>{links.map(([name, to]) => <li key={name}><Link to={to}>{name}</Link></li>)}</ul></nav>)}
      <div className="home-footer-updates"><h2>Stay in the loop</h2><p>Get the latest property updates and opportunities.</p><form onSubmit={submitUpdates} aria-busy={busy}><label className="sr-only" htmlFor="home-updates-email">Email address for property updates</label><input id="home-updates-email" type="email" name="email" maxLength={254} required autoComplete="email" placeholder="Enter your email" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /><button type="submit" disabled={busy} aria-label="Request property updates">{busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={19} aria-hidden="true" />}</button></form>{feedback && <p className={`home-footer-feedback ${failed ? "is-error" : ""}`} role={failed ? "alert" : "status"}>{feedback}</p>}</div>
    </div>
    <div className="home-footer-bottom"><span>&copy; {new Date().getFullYear()} {siteName}. All rights reserved.</span><InstallAppButton className="inline-flex items-center gap-1.5 font-medium text-white hover:underline" /><span>Ghana's home for property discovery.</span></div>
  </div></footer>;
};
export default HomeFooter;
