import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { AlertCircle, ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Clock, Loader2, Mail, MapPin, Phone, Send } from "lucide-react";
import NavOverlay from "../components/nav/NavOverlay";
import WhatsAppIcon from "../components/ui/WhatsAppIcon";
import SocialLinks from "../components/brand/SocialLinks";
import { usePlatform } from "../context/usePlatform";
import { businessContactItems } from "../utils/contact";
import { toWhatsAppNumber } from "../utils/whatsapp";
import { contactApi } from "../frontApi";
import "./contact.css";

const emptyForm = { name: "", email: "", phone: "", subject: "", message: "" };
const TOPICS = ["Buying a home", "Renting a home", "Selling a property", "Agent support", "Account support", "Something else"];
const CONTACT_TYPES = { phone: { icon: Phone, title: "Give us a call", caption: "Talk through your next step." }, email: { icon: Mail, title: "Write to us", caption: "Prefer email? Start a conversation." } };

const ContactField = ({ label, id, optional, ...props }) => (
  <div className="contact-field"><label htmlFor={id}>{label}{optional && <span> (optional)</span>}</label><input {...props} id={id} className="contact-input" /></div>
);

const Contact = () => {
  const { settings, siteName, paths } = usePlatform();
  const contact = settings.contact;
  const whatsapp = toWhatsAppNumber(contact.whatsapp);
  const info = businessContactItems(contact).filter((item) => item.kind !== "address" || contact.address || contact.city || contact.region);
  const channels = info.filter((item) => CONTACT_TYPES[item.kind]).map((item) => ({ ...item, ...CONTACT_TYPES[item.kind] }));
  if (whatsapp) channels.unshift({ kind: "whatsapp", icon: WhatsAppIcon, title: "Chat on WhatsApp", caption: "Send us a note, wherever you are.", lines: [contact.whatsapp], href: `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hello ${siteName}, I'd like to ask about…`)}`, external: true });
  const office = info.filter((item) => ["address", "hours"].includes(item.kind));
  const hasSocial = Object.values(settings.social).some(Boolean);
  const reduceMotion = useReducedMotion();
  const [formData, setFormData] = useState(emptyForm);
  const [submitted, setSubmitted] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef(null);
  const successRef = useRef(null);
  useEffect(() => {
    if (submitted) successRef.current?.focus();
    else if (error) errorRef.current?.focus();
  }, [submitted, error]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await contactApi.sendMessage(formData);
      setSubmitted({ email: formData.email.trim() });
      setFormData(emptyForm);
    } catch (err) { setError(err.message || "We couldn't send your message. Please try again."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="contact-page">
      <section className="contact-hero">
        <NavOverlay />
        <div className="container-page contact-hero-grid">
          <div>
            <nav className="contact-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Contact</span></nav>
            <span className="contact-eyebrow">A conversation with {siteName}</span>
            <h1>Let’s start a<br /><span>conversation.</span></h1>
            <p>A question about a home, your account, or your next move? We’re here to help you find your way.</p>
            <a href="#contact-form" className="contact-hero-button">Send us a message<ArrowDown size={16} aria-hidden="true" /></a>
          </div>
          <div className="contact-hero-photo"><img src="/banners/contact-support.jpg" alt="" decoding="async" /><div className="contact-photo-caption"><span>Every next chapter<br />starts with a hello.</span><ArrowUpRight size={26} aria-hidden="true" /></div></div>
        </div>
      </section>

      <section className="container-page contact-body" aria-label="Contact our team">
        <div className="contact-details">
          <span className="contact-section-label">LET’S CONNECT</span>
          <h2>Your next move,<br />a little closer.</h2>
          <p className="contact-intro">Choose the way that works for you. Our team can help with general questions, account support, and getting started.</p>
          {channels.length > 0 && <div className="contact-channels">{channels.map(({ kind, icon: Icon, title, caption, lines, href, external }) => <a key={kind} href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="contact-channel"><span className={`contact-channel-icon ${kind === "whatsapp" ? "is-whatsapp" : ""}`}><Icon className="h-5 w-5" aria-hidden="true" /></span><span className="contact-channel-text"><strong>{title}</strong><span>{lines.join(" · ")}</span><small>{caption}</small></span><ArrowUpRight className="contact-channel-arrow" size={18} aria-hidden="true" /></a>)}</div>}
          {office.length > 0 && <div className="contact-office">{office.map(({ kind, lines, href }) => { const Icon = kind === "address" ? MapPin : Clock; return <div key={kind} className="contact-office-row"><Icon size={18} aria-hidden="true" /><div><h3>{kind === "address" ? "Find our office" : "Office hours"}</h3>{lines.map((line) => <p key={line}>{line}</p>)}{href && <a href={href} target="_blank" rel="noopener noreferrer">Open directions<ArrowUpRight size={13} aria-hidden="true" /></a>}</div></div>; })}</div>}
          {hasSocial && <div className="contact-social"><p>Stay in the conversation</p><SocialLinks social={settings.social} tone="light" /></div>}
          <div className="contact-property-note"><span className="contact-section-label">A SPECIFIC PROPERTY?</span><h3>The right person is on the listing.</h3><p>For viewings, availability, or pricing, contact the agent directly from the property page.</p><Link to={paths.properties}>Explore properties<ArrowRight size={16} aria-hidden="true" /></Link></div>
        </div>

        <motion.div id="contact-form" className="contact-form-card" initial={reduceMotion ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: .4, ease: [.22, 1, .36, 1] }}>
          {submitted ? <div ref={successRef} tabIndex={-1} className="contact-confirmation" role="status"><span className="contact-success-mark"><Check size={28} aria-hidden="true" /></span><span className="contact-section-label">MESSAGE RECEIVED</span><h2>Thanks for saying hello.</h2><p>Your message is now in our team’s inbox. You provided <strong>{submitted.email}</strong> as your reply address.</p><button type="button" onClick={() => setSubmitted(null)} className="contact-submit">Send another message<ArrowRight size={17} aria-hidden="true" /></button><Link to={paths.properties}>Continue exploring properties<ArrowUpRight size={14} aria-hidden="true" /></Link></div> : <>
            <div className="contact-form-heading"><span className="contact-form-mark"><Send size={19} aria-hidden="true" /></span><div><span className="contact-section-label">DROP US A NOTE</span><h2>How can we help?</h2></div></div>
            <p className="contact-form-description">A few details will help us point you in the right direction.</p>
            <form onSubmit={handleSubmit} aria-busy={submitting} aria-describedby={error ? "contact-error" : undefined}>
              <fieldset disabled={submitting} className="contact-fields">
                <div className="contact-field-row"><ContactField id="contact-name" label="Full name" name="name" value={formData.name} onChange={handleChange} required maxLength={120} autoComplete="name" placeholder="Your full name" /><ContactField id="contact-email" label="Email address" type="email" name="email" value={formData.email} onChange={handleChange} required maxLength={254} autoComplete="email" placeholder="you@example.com" /></div>
                <div className="contact-field-row"><ContactField id="contact-phone" label="Phone number" optional type="tel" name="phone" value={formData.phone} onChange={handleChange} maxLength={30} autoComplete="tel" placeholder="e.g. 024 123 4567" /><div className="contact-field"><label htmlFor="contact-subject">What’s this about?</label><select id="contact-subject" name="subject" value={formData.subject} onChange={handleChange} required className="contact-input"><option value="" disabled>Select a topic</option>{TOPICS.map((topic) => <option key={topic}>{topic}</option>)}</select></div></div>
                <div className="contact-field"><label htmlFor="contact-message">Your message</label><textarea id="contact-message" name="message" value={formData.message} onChange={handleChange} required maxLength={4000} rows={6} placeholder="Tell us a little about what you need help with…" className="contact-input" aria-describedby="contact-message-hint" /><div id="contact-message-hint" className="contact-message-hint"><span>Share only the details needed to help with your question.</span><span>{formData.message.length.toLocaleString()} / 4,000</span></div></div>
              </fieldset>
              {error && <p id="contact-error" ref={errorRef} tabIndex={-1} role="alert" className="contact-error"><AlertCircle size={18} aria-hidden="true" />{error}</p>}
              <button type="submit" disabled={submitting} className="contact-submit"><span>{submitting ? "Sending your message…" : "Send message"}</span>{submitting ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowUpRight size={18} aria-hidden="true" />}</button>
              <p className="contact-form-footnote">We’ll use your contact details to respond to this message.</p>
            </form>
          </>}
        </motion.div>
      </section>

      <section className="container-page contact-faq" aria-labelledby="contact-faq-title"><div><span className="contact-section-label">BEFORE YOU ASK</span><h2 id="contact-faq-title">A little guidance.</h2><p>A few answers to get you started.</p></div><div className="contact-faq-list"><details><summary>How do I ask about a specific property?<ChevronDown size={18} aria-hidden="true" /></summary><p>Open the property listing to contact its agent, ask a question, or request a viewing. This form is for general questions for the {siteName} team.</p></details><details><summary>Can you help with an agent account?<ChevronDown size={18} aria-hidden="true" /></summary><p>Yes. Choose “Agent support” above and describe the issue. You can also <Link to="/login?account=agent">sign in to your agent account</Link> to check your application or workspace.</p></details><details><summary>Do I need an account to send a message?<ChevronDown size={18} aria-hidden="true" /></summary><p>No. Leave your name, email address, and message so the team has the details needed to respond.</p></details></div></section>
    </div>
  );
};

export default Contact;
