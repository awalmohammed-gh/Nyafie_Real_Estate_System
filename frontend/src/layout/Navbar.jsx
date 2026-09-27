import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Heart, Menu, X } from 'lucide-react';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { useAuth } from '../context/useAuth';
import { useRealEstate } from '../context/useRealEstate';
import { usePlatform } from '../context/usePlatform';
import BrandLogo from '../components/brand/BrandLogo';
import AccountMenu from '../components/account/AccountMenu';
import NotificationBell from '../components/ui/NotificationBell';
import { PropertyPreviewGrid, PropertyPreviewList } from '../components/nav/PropertyPreviews';
import { useNavPropertyPreviews } from '../hooks/useNavPropertyPreviews';

// Listing-type pages: all listings (URL set in Admin Settings), /rent and /sale (PropertyPerPage)
const buildLinks = (paths) => {
  const listingLinks = [
    { name: "All Listings", path: paths.listings, description: "Every property for sale and rent" },
    { name: "For Rent", path: "/rent", description: "Monthly and short stays" },
    { name: "For Sale", path: "/sale", description: "Homes ready to own" },
  ];
  const navLinks = [
    { name: "Home", path: "/" },
    { name: "Listings", menu: "listings", matches: listingLinks.map((l) => l.path) },
    { name: "Properties", menu: "properties", matches: [paths.properties, "/house/"] },
    { name: "Agents", path: paths.agents },
    { name: "Contact", path: "/contact" },
  ];
  return { listingLinks, navLinks };
};

const CLOSE_DELAY = 150; // lets the pointer cross the gap between a trigger and its panel
const panelMotion = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
  transition: { duration: 0.15, ease: "easeOut" },
};

const Logo = ({ onDark = false }) => (
  <Link to="/" className="min-w-0">
    <BrandLogo tone={onDark ? "dark" : "light"} />
  </Link>
);

// onDark: the transparent navbar over a hero (white text, soft white highlights)
const pillClass = (active, onDark = false) =>
  `relative flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-300 ${
    onDark
      ? active ? "bg-white/15 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
      : active ? "bg-brand-50 text-brand-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
  }`;

const drawerLinkClass = ({ isActive }) =>
  `block rounded-xl px-3 py-3 text-base font-semibold transition-colors ${
    isActive ? "bg-brand-50 text-brand-600" : "text-gray-700 hover:bg-gray-50"
  }`;

// Saved properties, with the same count the heart buttons on cards update
const WishlistLink = ({ count, onClick, className = "", onDark = false }) => (
  <Link
    to="/account/saved"
    onClick={onClick}
    aria-label={count ? `Wishlist, ${count} saved ${count === 1 ? "property" : "properties"}` : "Wishlist"}
    title="Wishlist"
    className={`relative place-items-center rounded-full transition ${onDark ? "text-white/90 hover:bg-white/10 hover:text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"} ${className}`}
  >
    <Heart className="h-5 w-5" />
    {count > 0 && (
      <span className={`absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ${onDark ? "ring-transparent" : "ring-white"}`}>
        {count > 9 ? "9+" : count}
      </span>
    )}
  </Link>
);

// overHero: the page starts with a dark hero. The navbar then overlays it with no background
// until the visitor scrolls; on other pages it is solid from the start.
const Navbar = ({ onAuth, overHero = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState(null); // desktop: "listings" | "properties" | null
  const [expanded, setExpanded] = useState(null); // mobile drawer section
  const { isAuthenticated } = useAuth();
  const { favorites } = useRealEstate();
  const { paths } = usePlatform();
  const { listingLinks, navLinks } = buildLinks(paths);
  const { pathname, search } = useLocation();
  const previews = useNavPropertyPreviews();
  const navRef = useRef(null);
  const closeTimer = useRef(null);

  useLockBodyScroll(isOpen);

  // Transparent while a hero is behind the navbar and the page is at the top
  const onDark = overHero && !scrolled;

  // Any navigation (including back/forward) closes open menus
  const routeKey = pathname + search;
  const [lastRoute, setLastRoute] = useState(routeKey);
  if (lastRoute !== routeKey) {
    setLastRoute(routeKey);
    setOpenMenu(null);
    setIsOpen(false);
  }

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!openMenu) return undefined;
    const handlePointer = (e) => !navRef.current?.contains(e.target) && setOpenMenu(null);
    const handleKey = (e) => e.key === "Escape" && setOpenMenu(null);
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openMenu]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const showMenu = (menu) => {
    clearTimeout(closeTimer.current);
    if (menu === "properties") previews.ensureLoaded();
    setOpenMenu(menu);
  };
  const hideMenu = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenMenu(null), CLOSE_DELAY);
  };
  const closeAll = () => {
    clearTimeout(closeTimer.current);
    setOpenMenu(null);
    setIsOpen(false);
  };

  // Hover opens menus for mouse users only; touch and keyboard use click
  const hoverHandlers = (menu) => ({
    onPointerEnter: (e) => e.pointerType === "mouse" && showMenu(menu),
    onPointerLeave: (e) => e.pointerType === "mouse" && hideMenu(),
    onBlur: (e) => !e.currentTarget.contains(e.relatedTarget) && setOpenMenu(null),
  });

  const toggleSection = (menu) => {
    if (menu === "properties") previews.ensureLoaded();
    setExpanded((prev) => (prev === menu ? null : menu));
  };

  const isSectionActive = (link) => link.matches.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p));

  return (
    <header
      className={`${overHero ? "fixed inset-x-0" : "sticky"} top-0 z-50 w-full border-b transition-[background-color,border-color,box-shadow] duration-300 ease-out ${
        onDark ? "border-transparent bg-transparent" : scrolled ? "border-gray-200/80 bg-white shadow-sm shadow-gray-900/5" : "border-transparent bg-white"
      }`}
    >
      <nav ref={navRef} className="container-page relative flex h-16 items-center justify-between gap-4 lg:h-20">
        <Logo onDark={onDark} />

        {/* Desktop links */}
        <ul className="hidden h-full items-center gap-1 lg:flex">
          {navLinks.map((link) => {
            if (!link.menu) {
              return (
                <li key={link.name}>
                  <NavLink to={link.path} end={link.path === "/"} className={({ isActive }) => pillClass(isActive, onDark)}>
                    {link.name}
                  </NavLink>
                </li>
              );
            }

            const open = openMenu === link.menu;
            const isMega = link.menu === "properties";
            return (
              // Full-height item so the pointer stays "inside" on its way down to the panel.
              // The Listings dropdown anchors to its trigger; the mega-menu anchors to the nav.
              <li key={link.name} className={`flex h-full items-center ${isMega ? "" : "relative"}`} {...hoverHandlers(link.menu)}>
                <button
                  type="button"
                  onClick={() => (open ? setOpenMenu(null) : showMenu(link.menu))}
                  aria-expanded={open}
                  aria-controls={`nav-menu-${link.menu}`}
                  className={pillClass(open || isSectionActive(link), onDark)}
                >
                  {link.name}
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {open && (
                    <motion.div
                      id={`nav-menu-${link.menu}`}
                      {...panelMotion}
                      className={
                        isMega
                          ? "absolute top-full left-1/2 z-40 w-[min(60rem,calc(100%-4rem))] -translate-x-1/2"
                          : "absolute top-full left-1/2 z-40 w-72 -translate-x-1/2"
                      }
                    >
                      <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 shadow-gray-900/8 ring-gray-200/80">
                        {isMega ? (
                          <PropertyPreviewGrid previews={previews} onNavigate={closeAll} />
                        ) : (
                          <ul className="p-2">
                            {listingLinks.map((sublink) => (
                              <li key={sublink.path}>
                                <NavLink
                                  to={sublink.path}
                                  onClick={closeAll}
                                  className={({ isActive }) =>
                                    `block rounded-xl px-4 py-3 transition-colors ${isActive ? "bg-brand-50" : "hover:bg-gray-50"}`
                                  }
                                >
                                  {({ isActive }) => (
                                    <>
                                      <span className={`block text-sm font-semibold ${isActive ? "text-brand-600" : "text-gray-900"}`}>{sublink.name}</span>
                                      <span className="block text-xs text-gray-500">{sublink.description}</span>
                                    </>
                                  )}
                                </NavLink>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>

        {/* Desktop actions */}
        <div className="hidden items-center gap-1 lg:flex">
          {isAuthenticated && <NotificationBell onDark={onDark} />}
          <WishlistLink count={favorites.length} className="grid h-10 w-10" onDark={onDark} />
          <span className={`mx-2 h-6 w-px transition-colors duration-300 ${onDark ? "bg-white/25" : "bg-gray-200"}`} aria-hidden="true" />
          <AccountMenu onAuth={onAuth} onDark={onDark} />
        </div>

        {/* Mobile actions */}
        <div className="flex items-center gap-1 lg:hidden">
          {isAuthenticated && <NotificationBell onDark={onDark} />}
          <WishlistLink count={favorites.length} className="hidden h-10 w-10 sm:grid" onDark={onDark} />
          <AccountMenu onAuth={onAuth} compact onDark={onDark} />
          <button
            onClick={() => setIsOpen(true)}
            aria-label="Open menu"
            aria-expanded={isOpen}
            className={`grid h-10 w-10 place-items-center rounded-full transition-colors ${onDark ? "text-white hover:bg-white/10" : "text-gray-700 hover:bg-gray-100"}`}
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
              onClick={closeAll}
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
                  onClick={closeAll}
                  aria-label="Close menu"
                  className="grid h-10 w-10 place-items-center rounded-full text-gray-700 hover:bg-gray-100"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                {navLinks.map((link) => {
                  if (!link.menu) {
                    return (
                      <NavLink key={link.name} to={link.path} end={link.path === "/"} onClick={closeAll} className={drawerLinkClass}>
                        {link.name}
                      </NavLink>
                    );
                  }

                  const open = expanded === link.menu;
                  return (
                    <div key={link.name}>
                      <button
                        type="button"
                        onClick={() => toggleSection(link.menu)}
                        aria-expanded={open}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-base font-semibold transition-colors ${
                          isSectionActive(link) ? "text-brand-600" : "text-gray-700"
                        } hover:bg-gray-50`}
                      >
                        {link.name}
                        <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                      </button>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <div className="ml-3 border-l border-gray-100 pl-2">
                              {link.menu === "properties" ? (
                                <PropertyPreviewList previews={previews} onNavigate={closeAll} />
                              ) : (
                                listingLinks.map((sublink) => (
                                  <NavLink
                                    key={sublink.path}
                                    to={sublink.path}
                                    onClick={closeAll}
                                    className={({ isActive }) =>
                                      `block rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                                        isActive ? "bg-brand-50 text-brand-600" : "text-gray-600 hover:bg-gray-50"
                                      }`
                                    }
                                  >
                                    {sublink.name}
                                  </NavLink>
                                ))
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                <div className="my-3 border-t border-gray-100" />
                <Link
                  to="/account/saved"
                  onClick={closeAll}
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <span className="flex items-center gap-3">
                    <Heart className="h-5 w-5 text-gray-400" />
                    Wishlist
                  </span>
                  {favorites.length > 0 && (
                    <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-600">{favorites.length}</span>
                  )}
                </Link>
              </div>

              {!isAuthenticated && (
                <div className="grid gap-3 border-t border-gray-100 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        closeAll();
                        onAuth("login");
                      }}
                      className="btn btn-light w-full"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => {
                        closeAll();
                        onAuth("signup");
                      }}
                      className="btn btn-light w-full"
                    >
                      Create Account
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Navbar;
