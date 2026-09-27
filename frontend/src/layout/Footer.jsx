import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ArrowUp, Clock, Heart, Mail, MapPin, Phone } from 'lucide-react';
import { usePlatform } from '../context/usePlatform';
import BrandLogo from '../components/brand/BrandLogo';
import SocialLinks from '../components/brand/SocialLinks';
import { businessContactItems } from '../utils/contact';

const exploreLinks = [
  { name: "Home", path: "/" },
  { name: "All Listings", page: "listings" },
  { name: "Our Agents", page: "agents" },
  { name: "Contact Us", path: "/contact" },
];

const serviceLinks = [
  { name: "Buy a Home", path: "/sale" },
  { name: "Rent a Home", path: "/rent" },
  { name: "Sell a Home", path: "/contact" },
  { name: "My Offers", path: "/account/offers" },
];

const LinkColumn = ({ title, links }) => (
  <div>
    <h3 className="mb-4 text-sm font-semibold tracking-wider text-white uppercase">{title}</h3>
    <ul className="space-y-3">
      {links.map((link) => (
        <li key={link.name}>
          <Link to={link.path} className="text-sm text-gray-400 transition-colors hover:text-white">
            {link.name}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

const CONTACT_ICONS = { address: MapPin, phone: Phone, email: Mail, hours: Clock };

const Footer = () => {
  const { settings, siteName, paths } = usePlatform();
  const contactItems = businessContactItems(settings.contact);
  const explore = exploreLinks.map((link) => ({ ...link, path: link.page ? paths[link.page] : link.path }));
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 600);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSubscribe = (e) => {
    e.preventDefault();
    // TODO: send the email to the backend once a newsletter endpoint exists
    setSubscribed(true);
    setEmail('');
  };

  return (
    <footer className="bg-gray-950 text-white">
      <div className="container-page pt-16 pb-8 sm:pt-20">
        {/* Newsletter */}
        <div className="mb-14 grid gap-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 sm:p-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Get new listings first</h2>
            <p className="mt-2 text-gray-400">
              Subscribe to get updates on new properties and exclusive offers.
            </p>
          </div>
          {subscribed ? (
            <p className="rounded-2xl bg-brand-500/15 px-5 py-4 text-sm font-medium text-brand-200">
              Thank you for subscribing! We'll keep you posted.
            </p>
          ) : (
            <form onSubmit={handleSubscribe} className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="newsletter-email" className="sr-only">Email address</label>
              <input
                id="newsletter-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="min-w-0 flex-1 rounded-full bg-white/10 px-5 py-3 text-sm text-white ring-1 ring-white/10 transition outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-brand-500"
              />
              <button type="submit" className="btn btn-primary">
                Subscribe
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>

        {/* Links */}
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12">
          <div className="sm:col-span-2 lg:col-span-4">
            <Link to="/" className="inline-flex">
              <BrandLogo tone="dark" size="lg" />
            </Link>
            {settings.general.description && (
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-gray-400">{settings.general.description}</p>
            )}
            <SocialLinks social={settings.social} className="mt-6" />
          </div>

          <div className="lg:col-span-2">
            <LinkColumn title="Explore" links={explore} />
          </div>
          <div className="lg:col-span-2">
            <LinkColumn title="Services" links={serviceLinks} />
          </div>

          <div className="sm:col-span-2 lg:col-span-4">
            <h3 className="mb-4 text-sm font-semibold tracking-wider text-white uppercase">Contact</h3>
            <ul className="space-y-4">
              {contactItems.map(({ kind, lines, href }) => {
                const Icon = CONTACT_ICONS[kind];
                return (
                <li key={kind} className="flex items-start gap-3 text-sm text-gray-400">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                  {href ? (
                    <a href={href} target={kind === "address" ? "_blank" : undefined} rel={kind === "address" ? "noopener noreferrer" : undefined} className="transition-colors hover:text-white">
                      {lines.map((line) => (
                        <span key={line} className="block">{line}</span>
                      ))}
                    </a>
                  ) : (
                    <span>
                      {lines.map((line) => (
                        <span key={line} className="block">{line}</span>
                      ))}
                    </span>
                  )}
                </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-center text-sm text-gray-500 sm:flex-row sm:text-left">
          <p>© {new Date().getFullYear()} {siteName}. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            Made with <Heart className="h-4 w-4 fill-red-500 text-red-500" /> in Ghana
          </p>
        </div>
      </div>

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Scroll to top"
            className="fixed right-4 bottom-24 z-40 grid h-12 w-12 place-items-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30 transition-colors hover:bg-brand-700 sm:right-8 lg:bottom-8"
          >
            <ArrowUp className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </footer>
  );
};

export default Footer;
