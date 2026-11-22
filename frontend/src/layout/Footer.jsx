import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, ArrowUp, Clock, Mail, MapPin, Phone } from 'lucide-react';
import { usePlatform } from '../context/usePlatform';
import BrandLogo from '../components/brand/BrandLogo';
import SocialLinks from '../components/brand/SocialLinks';
import { businessContactItems } from '../utils/contact';
import HomeFooter from '../components/Landing/HomeFooter';
import InstallAppButton from '../components/ui/InstallAppButton';

const exploreLinks = [
  { name: "Home", path: "/" },
  { name: "All Listings", page: "listings" },
  { name: "Our Agents", page: "agents" },
  { name: "About NyaFie", path: "/about" },
  { name: "Contact Us", path: "/contact" },
];

const serviceLinks = [
  { name: "Buy a Home", path: "/sale" },
  { name: "Rent a Home", path: "/rent" },
  { name: "List Your Property", path: "/agent/register" },
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
  const { pathname } = useLocation();
  const reducedMotion = useReducedMotion();
  const { settings, siteName, paths } = usePlatform();
  const contactItems = businessContactItems(settings.contact);
  const explore = exploreLinks.map((link) => ({ ...link, path: link.page ? paths[link.page] : link.path }));
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 600);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (pathname === '/') return <HomeFooter />;

  if (pathname.startsWith('/house/')) return (
    <footer className="property-detail-footer"><div className="container-page">
      <div className="property-footer-grid">
        <div className="property-footer-brand"><Link to="/" aria-label={`${siteName} home`}><BrandLogo tone="dark" /></Link><p>{settings.general.description}</p></div>
        <LinkColumn title="Explore" links={explore} />
        <LinkColumn title="Services" links={serviceLinks} />
        <div className="property-footer-contact"><h3>CONTACT</h3><ul>{contactItems.filter(item => item.kind !== 'hours').map(({ kind, lines, href }) => {
          const Icon = CONTACT_ICONS[kind];
          const text = lines.map(line => <span className="block" key={line}>{line}</span>);
          return <li key={kind}><Icon aria-hidden="true" />{href ? <a href={href} target={kind === 'address' ? '_blank' : undefined} rel={kind === 'address' ? 'noopener noreferrer' : undefined}>{text}</a> : <span>{text}</span>}</li>;
        })}</ul></div>
        <div className="property-footer-shortlist"><h3>Keep the places you love.</h3><p>Your favourites, together in one shortlist.</p><Link to="/account/saved">Open your shortlist <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      </div>
      <div className="property-footer-bottom"><span>&copy; {new Date().getFullYear()} {siteName}. All rights reserved.</span><InstallAppButton className="inline-flex items-center gap-2 text-white" /></div>
    </div></footer>
  );

  return (
    <footer className="bg-gray-950 text-white">
      <div className="container-page pt-16 pb-8 sm:pt-20">
        <div className="mb-10 flex flex-col justify-between gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Keep the places you love.</h2>
            <p className="mt-2 text-sm text-gray-400">
              Your favourites, together in one shortlist.
            </p>
          </div>
          <Link to="/account/saved" className="inline-flex min-h-11 items-center gap-4 self-start text-sm font-semibold text-brand-200 transition-colors hover:text-white sm:self-auto">Open your shortlist <ArrowUpRight className="h-5 w-5" aria-hidden="true" /></Link>
        </div>

        {/* Links */}
        <div className="grid grid-cols-2 gap-10 lg:grid-cols-12">
          <div className="col-span-2 lg:col-span-4">
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

          <div className="col-span-2 lg:col-span-4">
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
        <div className="mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 border-t border-white/10 pt-8 text-center text-sm text-gray-500">
          <p>© {new Date().getFullYear()} {siteName}. All rights reserved.</p>
          <InstallAppButton className="inline-flex items-center gap-1.5 font-medium text-gray-300 hover:text-white" />
        </div>
      </div>

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            onClick={() => window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' })}
            aria-label="Scroll to top"
            className="scroll-top-button fixed right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30 transition-colors hover:bg-brand-700 sm:right-8"
          >
            <ArrowUp className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </footer>
  );
};

export default Footer;
