import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, Heart, Menu, X } from 'lucide-react';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { useScrim } from '../hooks/useScrim';
import ScrimProvider from '../components/ui/ScrimProvider';
import { useAuth } from '../context/useAuth';
import { useRealEstate } from '../context/useRealEstate';
import { usePlatform } from '../context/usePlatform';
import BrandLogo from '../components/brand/BrandLogo';
import AccountMenu from '../components/account/AccountMenu';
import NotificationBell from '../components/ui/NotificationBell';
import { PropertyCategoryMenu } from '../components/nav/PropertyCategoryMenu';
import { usePropertyCategories } from '../hooks/usePropertyCategories';
import { useNavPropertyPreviews } from '../hooks/useNavPropertyPreviews';
import { FindPropertyLinks, FindPropertyMegaMenu, HomeCategoryMenu } from '../components/nav/FindPropertyMenu';
import { useCategoryPreviews } from '../hooks/useCategoryPreviews';
import { buildFindPropertyLinks } from '../utils/findPropertyNavigation';

// Find Property links share the unified catalogue and its existing query schema.
const buildLinks = (paths, propertyTypes) => {
  const listingLinks = buildFindPropertyLinks(paths.listings, propertyTypes);
  const navLinks = [
    { name: "Home", path: "/" },
    // The full catalogue has its own link (All Listings), so it highlights that one instead
    { name: "Find Property", menu: "listings", matches: ["/rent", "/sale"] },
    { name: "Properties", menu: "properties", matches: [paths.properties, "/house/"] },
    { name: "All Listings", path: paths.listings },
    // About and Contact are linked from the footer
    { name: "Agents", path: paths.agents },
  ];
  return { listingLinks, navLinks };
};

const CLOSE_DELAY = 150; // lets the pointer cross the gap between a trigger and its panel
const OPEN_DELAY = 90; // hover intent: brushing past a menu item on the way elsewhere doesn't open it (or flash the scrim)
// Fade in with a slight rise; quick enough to feel instant, slow enough to read as motion
const panelMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: 0.22, ease: "easeOut" },
};

const Logo = ({ onDark = false, reference = false }) => (
  <Link to="/" className="min-w-0">
    <BrandLogo tone={onDark ? "dark" : "light"} variant={reference ? "reference" : undefined} />
  </Link>
);

// onDark: the transparent navbar over a hero (white text, soft white highlights)
const pillClass = (active, onDark = false) =>
  `relative flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-300 ${
    onDark
      ? active ? "bg-white/15 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
      : active ? "bg-brand-50 text-brand-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
  }`;

// Mobile sheet rows: 48px touch targets; the active page gets brand text and a slim left bar
const sheetRowClass = (active) =>
  `relative flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 text-[0.9375rem] font-medium transition-colors ${
    active
      ? "text-brand-700 before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-brand-500"
      : "text-gray-800 hover:bg-gray-50 active:bg-gray-100"
  }`;

// The sheet slides down out of the header; reduced motion gets a plain fade
const SHEET_EASE = [0.22, 1, 0.36, 1];
const sheetMotion = (reduce) =>
  reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { y: "-100%", opacity: 0 },
        animate: { y: 0, opacity: 1, transition: { duration: 0.32, ease: SHEET_EASE } },
        exit: { y: "-100%", opacity: 0, transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } },
      };
const accordionMotion = (reduce) => ({
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: reduce ? 0 : 0.24, ease: SHEET_EASE },
});

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
const NavbarContent = ({ onAuth, overHero = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState(null); // desktop: "listings" | "properties" | null
  const [expanded, setExpanded] = useState(null); // mobile drawer section
  const { isAuthenticated } = useAuth();
  const { favorites } = useRealEstate();
  const { paths, settings } = usePlatform();
  const { pathname, search } = useLocation();
  const referenceHome = pathname === "/";
  const standardLinks = buildLinks(paths, settings.property.propertyTypes);
  const listingLinks = standardLinks.listingLinks;
  const navLinks = referenceHome ? [
    { name: "Buy", menu: "buy", matches: ["/sale"] },
    { name: "Rent", menu: "rent", matches: ["/rent"] },
    { name: "Short Stays", menu: "stays", matches: [] },
    { name: "All Listings", path: paths.listings },
    { name: "Agents", path: paths.agents },
  ] : standardLinks.navLinks;
  const homeMenuLinks = (menu) => {
    const href = (params) => `${paths.listings}?${new URLSearchParams(params)}`;
    const status = menu === "buy" ? "Sale" : "Rent";
    return menu === "stays" ? [
      { key: "all-stays", name: "All short stays", path: href({ type: "Hotel,Hotel-Apartment" }), description: "Hotels and serviced apartments" },
      { key: "hotels", name: "Hotels", path: href({ type: "Hotel" }), description: "Find a room for your next stay" },
      { key: "hotel-apartments", name: "Hotel apartments", path: href({ type: "Hotel-Apartment" }), description: "Furnished stays with room to settle in" },
    ] : [
      { key: "all", name: menu === "buy" ? "All properties for sale" : "All properties for rent", path: href({ status }), description: "Browse every available property" },
      { key: "apartments", name: "Apartments", path: href({ status, type: "Apartment" }), description: "Explore apartments across Ghana" },
      { key: "all-listings", name: "View all properties", path: paths.listings, description: "Explore the full catalogue" },
    ];
  };
  const previews = useNavPropertyPreviews();
  // Homepage menus show three homes from their category (loaded when the menu first opens)
  const categoryPreviews = useCategoryPreviews();
  const HOME_MENU_HEADINGS = { buy: "Homes for sale", rent: "Homes to rent", stays: "Short stays" };
  const categories = usePropertyCategories();
  const navRef = useRef(null);
  const drawerRef = useRef(null);
  const mobileTriggerRef = useRef(null);
  const closeTimer = useRef(null);
  const openTimer = useRef(null);

  const reduceMotion = useReducedMotion();

  useLockBodyScroll(isOpen);
  // The mobile sheet blurs the page behind it with the same scrim as the desktop menus;
  // tapping the blurred page closes it
  useScrim(isOpen, () => {
    setIsOpen(false);
    setExpanded(null);
    mobileTriggerRef.current?.focus();
  });

  // The sheet only exists below the desktop breakpoint: growing the window closes it
  // (otherwise the page would stay scroll-locked behind a hidden menu)
  useEffect(() => {
    if (!isOpen) return undefined;
    const desktop = window.matchMedia("(min-width: 64rem)");
    const onChange = (e) => e.matches && (setIsOpen(false), setExpanded(null));
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, [isOpen]);
  // Blur the page behind an open desktop menu; clicking the blurred page closes it
  useScrim(Boolean(openMenu), () => {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    setOpenMenu(null);
  });

  // Transparent while a hero is behind the navbar and the page is at the top
  const onDark = overHero && !scrolled && !isOpen;

  // Any navigation (including back/forward) closes open menus
  const routeKey = pathname + search;
  const [lastRoute, setLastRoute] = useState(routeKey);
  if (lastRoute !== routeKey) {
    setLastRoute(routeKey);
    setOpenMenu(null);
    setIsOpen(false);
    setExpanded(null);
  }

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!openMenu) return undefined;
    const dismiss = () => {
      clearTimeout(closeTimer.current);
      clearTimeout(openTimer.current);
      setOpenMenu(null);
    };
    const handlePointer = (e) => !navRef.current?.contains(e.target) && dismiss();
    const handleKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      navRef.current?.querySelector(`[aria-controls="nav-menu-${openMenu}"]`)?.focus();
      dismiss();
    };
    const desktop = window.matchMedia("(min-width: 64rem)");
    const handleResize = (e) => !e.matches && dismiss();
    desktop.addEventListener("change", handleResize);
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
      desktop.removeEventListener("change", handleResize);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const frame = requestAnimationFrame(() => drawerRef.current?.querySelector('a[href], button')?.focus());
    const handleKey = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setExpanded(null);
        mobileTriggerRef.current?.focus();
      }
      if (e.key === "Tab") {
        const links = [mobileTriggerRef.current, ...(drawerRef.current?.querySelectorAll('a[href], button:not([disabled])') || [])].filter(Boolean);
        const first = links[0];
        const last = links[links.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  useEffect(() => () => {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
  }, []);

  useEffect(() => {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
  }, [routeKey]);

  const showMenu = (menu) => {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    if (menu === 'listings') previews.ensureLoaded();
    if (referenceHome) categoryPreviews.ensure(menu);
    setOpenMenu(menu);
  };
  const hideMenu = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      // Moving the mouse away must not dismiss links a keyboard user is navigating.
      if (!navRef.current?.querySelector('[id^="nav-menu-"]')?.contains(document.activeElement)) setOpenMenu(null);
    }, CLOSE_DELAY);
  };
  const closeAll = () => {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    if (isOpen) mobileTriggerRef.current?.focus();
    setOpenMenu(null);
    setIsOpen(false);
    setExpanded(null);
  };

  // Hover opens menus for mouse users only; touch and keyboard use click
  const hoverHandlers = (menu) => ({
    onPointerEnter: (e) => {
      if (e.pointerType !== "mouse") return;
      // Moving between menus switches straight away; opening the first one waits a moment
      if (openMenu) return showMenu(menu);
      clearTimeout(closeTimer.current);
      clearTimeout(openTimer.current);
      openTimer.current = setTimeout(() => showMenu(menu), OPEN_DELAY);
    },
    onPointerLeave: (e) => e.pointerType === "mouse" && hideMenu(),
    onBlur: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) {
        clearTimeout(closeTimer.current);
        clearTimeout(openTimer.current);
        setOpenMenu(null);
      }
    },
  });

  const toggleSection = (menu) => {
    setExpanded((prev) => (prev === menu ? null : menu));
  };

  const isSectionActive = (link) => link.matches.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p));

  return (
    <header
      className={`${referenceHome ? "reference-header " : ""}${onDark ? "is-over-hero " : ""}${overHero ? "fixed inset-x-0" : "sticky"} top-0 z-50 w-full border-b transition-[background-color,border-color,box-shadow] duration-300 ease-out ${
        onDark ? "border-transparent bg-transparent" : isOpen ? "border-gray-100 bg-white" : scrolled ? "border-gray-200/80 bg-white shadow-sm shadow-gray-900/5" : "border-transparent bg-white"
      }`}
    >
      <nav ref={navRef} className="container-page relative flex h-16 items-center justify-between gap-4 lg:h-20">
        <Logo onDark={onDark} reference={referenceHome} />

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
            return (
              // Full-height item so the pointer stays "inside" on its way down to the panel.
              // Both wide panels anchor to the navbar container, keeping them inside the viewport.
              <li key={link.name} className="flex h-full items-center" {...hoverHandlers(link.menu)}>
                <button
                  type="button"
                  onClick={() => (open ? closeAll() : showMenu(link.menu))}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowDown') return;
                    e.preventDefault();
                    showMenu(link.menu);
                    requestAnimationFrame(() => navRef.current?.querySelector(`#nav-menu-${link.menu} a[href]`)?.focus());
                  }}
                  aria-expanded={open}
                  aria-controls={`nav-menu-${link.menu}`}
                  className={pillClass(open || isSectionActive(link), onDark)}
                >
                  {link.name}
                  <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {open && (
                    <motion.div
                      id={`nav-menu-${link.menu}`}
                      role="region"
                      aria-label={link.name}
                      {...(reduceMotion ? { ...panelMotion, initial: { opacity: 0 }, exit: { opacity: 0 }, transition: { duration: 0.12 } } : panelMotion)}
                      className={referenceHome ? "absolute top-full left-1/2 z-40 w-[min(56rem,calc(100%_-_2rem))] -translate-x-1/2 pt-1" : `absolute top-full left-1/2 z-40 -translate-x-1/2 ${link.menu === 'listings' ? 'w-[min(56rem,calc(100%_-_4rem))]' : 'w-[min(48rem,calc(100%_-_4rem))]'}`}
                    >
                      <div className="glass-panel max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain rounded-xl border border-gray-200/70 shadow-xl shadow-gray-900/8">
                        {referenceHome ? <HomeCategoryMenu heading={HOME_MENU_HEADINGS[link.menu] || link.name} links={homeMenuLinks(link.menu)} previews={categoryPreviews.get(link.menu)} viewAll={homeMenuLinks(link.menu)[0].path} onNavigate={closeAll} /> : link.menu === 'properties' ? (
                          <PropertyCategoryMenu categories={categories} onNavigate={closeAll} />
                        ) : (
                          <FindPropertyMegaMenu links={listingLinks} previews={previews} onNavigate={closeAll} />
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
          <AccountMenu onAuth={onAuth} onDark={onDark} label={referenceHome ? "My Account" : undefined} />
        </div>

        {/* Mobile actions */}
        <div className="flex items-center gap-1 lg:hidden">
          {isAuthenticated && <NotificationBell onDark={onDark} />}
          <WishlistLink count={favorites.length} className="hidden h-10 w-10 sm:grid" onDark={onDark} />
          <AccountMenu onAuth={onAuth} compact onDark={onDark} />
          <button
            ref={mobileTriggerRef}
            type="button"
            onClick={() => (isOpen ? closeAll() : setIsOpen(true))}
            aria-label={isOpen ? "Close menu" : "Open menu"}
            aria-expanded={isOpen}
            aria-controls="mobile-nav"
            className={`grid h-11 w-11 place-items-center rounded-full transition-colors ${onDark ? "text-white hover:bg-white/10" : "text-gray-700 hover:bg-gray-100"}`}
          >
            <span className="relative h-6 w-6" aria-hidden="true">
              <Menu className={`absolute inset-0 h-6 w-6 transition duration-200 ease-out ${isOpen ? "scale-75 rotate-90 opacity-0" : ""}`} />
              <X className={`absolute inset-0 h-6 w-6 transition duration-200 ease-out ${isOpen ? "" : "scale-75 -rotate-90 opacity-0"}`} />
            </span>
          </button>
        </div>
      </nav>

      {/*
        Mobile navigation: a sheet that slides down out of the header. The clip box starts at
        the header's bottom edge, so the sheet appears from underneath the bar and never
        extends past the viewport (100dvh avoids the mobile address-bar jump).
      */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(100%+1px)] h-[calc(100dvh-4rem-1px)] overflow-hidden lg:hidden">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              id="mobile-nav"
              ref={drawerRef}
              {...sheetMotion(reduceMotion)}
              className="pointer-events-auto max-h-full overflow-y-auto overscroll-contain border-b border-gray-200/80 bg-white shadow-[0_18px_36px_-18px_rgb(15_23_42/0.25)]"
            >
              <nav aria-label="Main navigation" className="container-page pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <ul className="-mx-3 divide-y divide-gray-100">
                  {navLinks.map((link) => {
                    if (!link.menu) {
                      return (
                        <li key={link.name} className="py-1">
                          <NavLink to={link.path} end={link.path === "/"} onClick={closeAll} className={({ isActive }) => sheetRowClass(isActive)}>
                            {link.name}
                          </NavLink>
                        </li>
                      );
                    }

                    // Tapping a section only expands it; the sheet stays open
                    const open = expanded === link.menu;
                    return (
                      <li
                        key={link.name}
                        className="py-1"
                        onKeyDown={(e) => {
                          if (e.key === "Escape" && open) {
                            e.stopPropagation();
                            setExpanded(null);
                            e.currentTarget.querySelector('button')?.focus();
                          }
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSection(link.menu)}
                          aria-expanded={open}
                          aria-controls={`mobile-nav-menu-${link.menu}`}
                          className={sheetRowClass(isSectionActive(link))}
                        >
                          {link.name}
                          <ChevronDown aria-hidden="true" className={`h-5 w-5 text-gray-400 transition-transform duration-200 ease-out ${open ? "rotate-180 text-gray-600" : ""}`} />
                        </button>
                        <AnimatePresence initial={false}>
                          {open && (
                            <motion.div id={`mobile-nav-menu-${link.menu}`} {...accordionMotion(reduceMotion)} className="overflow-hidden">
                              <div className="ml-3 border-l border-gray-100 pt-1 pb-2 pl-2">
                                {referenceHome ? <FindPropertyLinks links={homeMenuLinks(link.menu)} onNavigate={closeAll} compact /> : link.menu === "properties" ? (
                                  <PropertyCategoryMenu categories={categories} onNavigate={closeAll} compact />
                                ) : (
                                  <FindPropertyLinks links={listingLinks} onNavigate={closeAll} compact />
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </li>
                    );
                  })}
                  <li className="py-1">
                    <NavLink to="/account/saved" onClick={closeAll} className={({ isActive }) => sheetRowClass(isActive)}>
                      <span className="flex items-center gap-3">
                        <Heart aria-hidden="true" className="h-5 w-5 text-gray-400" />
                        Wishlist
                      </span>
                      {favorites.length > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 tabular-nums">{favorites.length}</span>}
                    </NavLink>
                  </li>
                </ul>

                {!isAuthenticated && (
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
                    <button type="button" onClick={() => { closeAll(); onAuth("login"); }} className="btn btn-primary w-full py-3 shadow-none">
                      Sign In
                    </button>
                    <button type="button" onClick={() => { closeAll(); onAuth("signup"); }} className="btn btn-light w-full py-3">
                      Create Account
                    </button>
                  </div>
                )}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};

// The navigation and every menu in it share one page scrim
const Navbar = (props) => (
  <ScrimProvider>
    <NavbarContent {...props} />
  </ScrimProvider>
);

export default Navbar;
