import { Link, useLocation } from "react-router-dom";
import { ArrowRight, BedDouble, CalendarDays, ChevronRight, Heart, House, KeyRound, Layers, Users, X } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { usePlatform } from "../../context/usePlatform";
import { promoAllowedFor } from "../../utils/agentPromo";

const STAYS = "Hotel,Hotel-Apartment";

// Which tile is the current page (one at most): Buy/Rent/Short Stays are filtered views of the listings
const currentTile = (pathname, search, paths) => {
  const query = new URLSearchParams(search);
  if (pathname === "/") return "home";
  if (pathname === "/sale" || (pathname === paths.listings && query.get("status") === "Sale")) return "buy";
  if (pathname === "/rent" || (pathname === paths.listings && query.get("status") === "Rent")) return "rent";
  if (pathname === paths.listings && query.get("type") === STAYS) return "stays";
  if (pathname === paths.listings) return "listings";
  if (pathname === paths.agents || pathname.startsWith(`${paths.agents}/`)) return "agents";
  return null;
};

/**
 * The phone menu's contents (inside the navbar's sheet, layout/Navbar.jsx): six tiles for the main
 * destinations, the wishlist, and an invitation to list a property.
 *  - showHeader: a handle, title and close button (when it's a sheet rising from the tab bar)
 *  - onNavigate: closes the menu when a link is followed
 */
const MobileMenu = ({ showHeader = false, onClose, onNavigate, wishlistCount = 0 }) => {
  const { pathname, search } = useLocation();
  const { paths, siteName } = usePlatform();
  const { user } = useAuth();
  const current = currentTile(pathname, search, paths);
  const tiles = [
    { key: "home", label: "Home", to: "/", Icon: House },
    { key: "buy", label: "Buy", to: "/sale", Icon: KeyRound },
    { key: "rent", label: "Rent", to: "/rent", Icon: CalendarDays },
    { key: "stays", label: "Short Stays", to: `${paths.listings}?${new URLSearchParams({ type: STAYS })}`, Icon: BedDouble },
    { key: "listings", label: "All Listings", to: paths.listings, Icon: Layers },
    { key: "agents", label: "Agents", to: paths.agents, Icon: Users },
  ];

  return (
    // pb-8 above the tab bar: clear of its raised Menu button
    <div className={`container-page pt-2 ${showHeader ? "pb-8" : "pb-4"}`}>
      {showHeader && (
        <>
          <span className="mx-auto mb-1 block h-1 w-10 rounded-full bg-gray-200" aria-hidden="true" />
          <div className="mb-3 flex items-center justify-between">
            <p className="text-base font-semibold text-gray-900">Menu</p>
            <button type="button" onClick={onClose} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      <ul className="grid grid-cols-3 gap-2">
        {tiles.map(({ key, label, to, Icon }) => {
          const active = current === key;
          return (
            <li key={key}>
              <Link
                to={to}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-1 py-3 text-center text-[13px] font-semibold transition-colors ${
                  active
                    ? "border-brand-400 bg-linear-to-b from-brand-50 to-brand-100 text-brand-800"
                    : "border-gray-200/80 bg-gray-50/70 text-gray-800 hover:border-brand-200 hover:bg-brand-50/60"
                }`}
              >
                <Icon className="h-5 w-5 text-brand-700" strokeWidth={1.8} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* The account (and signing in) stays in the navbar */}
      <Link to="/account/saved" onClick={onNavigate} className="mt-3 flex min-h-12 w-full items-center gap-3 border-y border-gray-100 px-1 text-sm font-medium text-gray-900 transition-colors hover:text-brand-700">
        <Heart className="h-5 w-5 text-brand-700" strokeWidth={1.8} aria-hidden="true" />
        <span className="flex-1">Wishlist</span>
        {wishlistCount > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand-100 px-1.5 text-xs font-semibold text-brand-700 tabular-nums">{wishlistCount}</span>}
        <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
      </Link>

      {/* Not shown to agents, admins, or anyone already applying (same rule as the agent pop-up) */}
      {promoAllowedFor(user) && (
        <div className="relative mt-4 overflow-hidden rounded-2xl bg-linear-to-br from-[#8d1aa6] to-[#5b0f76] p-4 text-white">
          <img src="/hero/nyafie-modern-villa-960.jpg" alt="" loading="lazy" decoding="async" className="absolute inset-y-0 right-0 h-full w-[45%] object-cover [mask-image:linear-gradient(to_right,transparent,black_45%)]" />
          <div className="relative max-w-[62%]">
            <p className="text-base leading-tight font-bold">List Your Property</p>
            <p className="mt-1 text-[13px] leading-snug text-white/85">Reach more buyers and renters on {siteName}.</p>
            <Link to={user ? "/agent/plans" : "/agent/register"} onClick={onNavigate} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13px] font-semibold text-brand-800 transition-colors hover:bg-brand-50">
              Become an Agent <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileMenu;
