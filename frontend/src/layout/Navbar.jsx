import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, FileText, Menu, X } from 'lucide-react';
import { useRealEstate } from '../context/useRealEstate';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { useAuth } from '../context/useAuth';
import AccountMenu from '../components/account/AccountMenu';

const navLinks = [
  { name: "Home", path: "/" },
  {
    name: "Properties",
    category: [
      { name: "For Sale", path: "/sale", description: "Homes ready to own" },
      { name: "For Rent", path: "/rent", description: "Monthly and short stays" },
      { name: "All Properties", path: "/properties", description: "Everything we list" },
    ],
  },
  { name: "Listings", path: "/listings" },
  { name: "Agents", path: "/agents" },
  { name: "Contact", path: "/contact" },
];

const Logo = () => (
  <Link to="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight sm:text-2xl">
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-base text-white shadow-lg shadow-brand-500/30">
      H
    </span>
    <span>
      <span className="text-gray-900">Home</span>
      <span className="text-brand-500">Base</span>
    </span>
  </Link>
);

const desktopLinkClass = ({ isActive }) =>
  `relative rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
    isActive ? "bg-brand-50 text-brand-600" : "text-gray-600 hover:text-gray-900"
  }`;

const Navbar = ({ onAuth }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { makeOffer } = useRealEstate();
  const { isAuthenticated } = useAuth();

  useLockBodyScroll(isOpen);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const closeMenu = () => setIsOpen(false);

  const offerBadge = makeOffer.length > 0 && (
    <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
      {makeOffer.length}
    </span>
  );

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled ? "bg-white/85 shadow-sm shadow-gray-900/5 backdrop-blur-lg" : "bg-white"
      }`}
    >
      <nav className="container-page flex h-16 items-center justify-between gap-4 lg:h-20">
        <Logo />

        {/* Desktop links */}
        <ul className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) =>
            link.category ? (
              <li key={link.name} className="group relative">
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold text-gray-600 transition-colors group-focus-within:text-gray-900 hover:text-gray-900"
                >
                  {link.name}
                  <ChevronDown className="h-4 w-4 transition-transform duration-300 group-focus-within:rotate-180 group-hover:rotate-180" />
                </button>
                <div className="invisible absolute top-full left-1/2 w-72 -translate-x-1/2 translate-y-2 pt-3 opacity-0 transition-all duration-200 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                  <ul className="rounded-2xl bg-white p-2 shadow-xl ring-1 shadow-gray-900/10 ring-gray-100">
                    {link.category.map((sublink) => (
                      <li key={sublink.path}>
                        <NavLink
                          to={sublink.path}
                          className={({ isActive }) =>
                            `block rounded-xl px-4 py-3 transition-colors ${
                              isActive ? "bg-brand-50" : "hover:bg-gray-50"
                            }`
                          }
                        >
                          <span className="block text-sm font-semibold text-gray-900">{sublink.name}</span>
                          <span className="block text-xs text-gray-500">{sublink.description}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ) : (
              <li key={link.name}>
                <NavLink to={link.path} end={link.path === "/"} className={desktopLinkClass}>
                  {link.name}
                </NavLink>
              </li>
            )
          )}
        </ul>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 lg:flex">
          <Link to="/offer" className="btn btn-primary relative px-5 py-2.5">
            <FileText className="h-4 w-4" />
            Make an Offer
            {offerBadge}
          </Link>
          <AccountMenu onAuth={onAuth} />
        </div>

        {/* Mobile actions */}
        <div className="flex items-center gap-1 lg:hidden">
          <Link
            to="/offer"
            aria-label="Your offer list"
            className="relative grid h-10 w-10 place-items-center rounded-full text-gray-700 hover:bg-gray-100"
          >
            <FileText className="h-5 w-5" />
            {offerBadge}
          </Link>
          <AccountMenu onAuth={onAuth} compact />
          <button
            onClick={() => setIsOpen(true)}
            aria-label="Open menu"
            aria-expanded={isOpen}
            className="grid h-10 w-10 place-items-center rounded-full text-gray-700 hover:bg-gray-100"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMenu}
              className="absolute inset-0 bg-gray-950/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="absolute inset-y-0 right-0 flex h-dvh w-[85%] max-w-sm flex-col bg-white shadow-2xl"
            >
              <div className="flex h-16 items-center justify-between border-b border-gray-100 px-5">
                <Logo />
                <button
                  onClick={closeMenu}
                  aria-label="Close menu"
                  className="grid h-10 w-10 place-items-center rounded-full text-gray-700 hover:bg-gray-100"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-4">
                {navLinks.map((link) =>
                  link.category ? (
                    <div key={link.name} className="py-2">
                      <p className="px-3 pb-1 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                        {link.name}
                      </p>
                      {link.category.map((sublink) => (
                        <NavLink
                          key={sublink.path}
                          to={sublink.path}
                          onClick={closeMenu}
                          className={({ isActive }) =>
                            `block rounded-xl px-3 py-3 text-base font-semibold transition-colors ${
                              isActive ? "bg-brand-50 text-brand-600" : "text-gray-700 hover:bg-gray-50"
                            }`
                          }
                        >
                          {sublink.name}
                        </NavLink>
                      ))}
                    </div>
                  ) : (
                    <NavLink
                      key={link.name}
                      to={link.path}
                      end={link.path === "/"}
                      onClick={closeMenu}
                      className={({ isActive }) =>
                        `block rounded-xl px-3 py-3 text-base font-semibold transition-colors ${
                          isActive ? "bg-brand-50 text-brand-600" : "text-gray-700 hover:bg-gray-50"
                        }`
                      }
                    >
                      {link.name}
                    </NavLink>
                  )
                )}
              </div>

              <div className="grid gap-3 border-t border-gray-100 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                {!isAuthenticated && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        closeMenu();
                        onAuth("login");
                      }}
                      className="btn btn-light w-full"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => {
                        closeMenu();
                        onAuth("signup");
                      }}
                      className="btn btn-light w-full"
                    >
                      Create Account
                    </button>
                  </div>
                )}
                <Link to="/offer" onClick={closeMenu} className="btn btn-primary w-full">
                  Make an Offer {makeOffer.length > 0 && `(${makeOffer.length})`}
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Navbar;
