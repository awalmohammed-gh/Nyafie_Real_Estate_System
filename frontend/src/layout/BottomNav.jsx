import { Link, useLocation } from "react-router-dom";
import { Heart, House, Menu, MessageCircle, Search, X } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { usePlatform } from "../context/usePlatform";
import { useDesktop } from "../hooks/useDesktop";
import { useUnreadMessages } from "../hooks/useNotifications";
import { bottomNavTab } from "../utils/bottomNav";

/**
 * The public site's tab bar on phones and tablets (hidden from 1024px, where the navbar shows everything).
 * Where it appears: utils/bottomNav.js. While it shows, the layout reserves its height (.has-bottom-nav)
 * so the footer and floating cards stay above it.
 *  - Home, Explore | Menu | Saved, Messages. The account stays in the navbar.
 *  - Menu opens the site menu (the navbar's sheet, layout/Navbar.jsx), rising from just above this bar;
 *    it becomes "Close" while open. The header has no menu button while this bar shows.
 *  - Saved and Messages ask guests to sign in first.
 */
const BottomNav = ({ menuOpen, onMenuToggle, onNavigate, menuButtonRef }) => {
  const { pathname } = useLocation();
  const { paths } = usePlatform();
  const { isAuthenticated } = useAuth();
  const desktop = useDesktop();
  // Only polled while the bar is on screen and someone is signed in
  const unread = useUnreadMessages(isAuthenticated && !desktop);
  // While the menu is open, the menu is "where you are"
  const current = menuOpen ? "menu" : bottomNavTab(pathname, paths);

  const tab = ({ key, label, to, Icon, badge }) => {
    const active = current === key;
    return (
      <li key={key}>
        <Link to={to} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${active ? "text-brand-700" : "text-gray-500 hover:text-gray-800"}`}>
          {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-600" aria-hidden="true" />}
          <span className="relative">
            <Icon className="h-6 w-6" strokeWidth={active ? 2.3 : 1.8} aria-hidden="true" />
            {badge > 0 && (
              <span className="absolute -top-1.5 left-3.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-white">
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </span>
          <span>{label}{badge > 0 && <span className="sr-only"> ({badge} unread)</span>}</span>
        </Link>
      </li>
    );
  };

  return (
    // z-55: above the page blur (z-40) and the navbar's menu sheet (z-50), so the raised "Close" button stays
    // whole and sharp; pop-up cards (z-90), the page loader and toasts still cover it
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-55 border-t border-gray-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgb(23_16_38/0.06)] backdrop-blur-md lg:hidden">
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {tab({ key: "home", label: "Home", to: "/", Icon: House })}
        {tab({ key: "explore", label: "Explore", to: paths.listings, Icon: Search })}
        <li className="flex justify-center">
          {/* Raised centre button: opens the site menu (Buy, Rent, Short Stays, All Listings, Agents, Wishlist) */}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={onMenuToggle}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="flex flex-col items-center gap-1 text-[11px] font-medium text-brand-700"
          >
            <span className={`-mt-5 grid h-13 w-13 place-items-center rounded-full bg-linear-to-br from-[#931eac] to-[#651080] text-white shadow-lg shadow-brand-700/30 ring-4 ring-white transition-transform duration-200 active:scale-95 ${menuOpen ? "rotate-90" : ""}`}>
              {menuOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
            </span>
            <span aria-hidden="true">{menuOpen ? "Close" : "Menu"}</span>
          </button>
        </li>
        {tab({ key: "saved", label: "Saved", to: "/account/saved", Icon: Heart })}
        {tab({ key: "messages", label: "Messages", to: "/account/messages", Icon: MessageCircle, badge: unread })}
      </ul>
    </nav>
  );
};

export default BottomNav;
