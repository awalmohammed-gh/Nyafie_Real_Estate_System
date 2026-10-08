import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  BadgeCheck,
  Building,
  Building2,
  ChevronDown,
  CreditCard,
  HandCoins,
  Heart,
  KeyRound,
  Inbox,
  LayoutDashboard,
  LogIn,
  LogOut,
  MessageSquare,
  MessageCircle,
  PlusSquare,
  Settings,
  UserPlus,
  UserRound,
  ShieldCheck,
  ClipboardCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useScrim } from "../../hooks/useScrim";
import { useToast } from "../../context/useToast";
import UserAvatar from "./UserAvatar";
import { canAccessAgent } from "../../utils/sessionDomain";

const userItems = [
  { label: "My Profile", to: "/account/profile", icon: UserRound },
  { label: "Saved Properties", to: "/account/saved", icon: Heart },
  { label: "My Conversations", to: "/account/messages", icon: MessageCircle },
  { label: "My Offers", to: "/account/offers", icon: HandCoins },
  { label: "My Rentals", to: "/account/rentals", icon: KeyRound },
  { label: "My Purchases", to: "/account/purchases", icon: Building },
  { label: "My Inquiries", to: "/account/inquiries", icon: MessageSquare },
  { label: "Become an Agent", to: "/agent/plans", icon: BadgeCheck, highlight: true, badge: "NEW" },
  { label: "Settings", to: "/account/settings", icon: Settings },
];

const adminItems = [
  { label: "Admin Dashboard", to: "/admin/dashboard", icon: ShieldCheck, highlight: true },
  { label: "Review properties", to: "/admin/properties?status=pending", icon: ClipboardCheck },
  { label: "Messages", to: "/admin/messages", icon: MessageCircle },
  { label: "Platform settings", to: "/admin/settings", icon: SlidersHorizontal },
];

const agentItems = [
  { label: "Settings", to: "/agent/settings", icon: Settings },
  { label: "Agent Dashboard", to: "/agent/dashboard", icon: LayoutDashboard },
  { label: "My Properties", to: "/agent/properties", icon: Building2 },
  { label: "Add Property", to: "/agent/properties/add", icon: PlusSquare },
  { label: "Property Inquiries", to: "/agent/inquiries", icon: Inbox },
  { label: "Offers Received", to: "/agent/offers", icon: HandCoins },
  { label: "Rental Requests", to: "/agent/rentals", icon: KeyRound },
  { label: "Sale Requests", to: "/agent/sale-requests", icon: Building },
  { label: "Messages", to: "/agent/messages", icon: MessageCircle },
  { label: "Subscription", to: "/agent/subscription", icon: CreditCard },
];

export const AgentBadge = ({ className = "" }) => (
  <span className={`inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold tracking-wide text-brand-700 uppercase ring-1 ring-brand-200 ring-inset ${className}`}>
    <BadgeCheck className="h-3 w-3" />
    Agent
  </span>
);

export const AdminBadge = ({ className = "" }) => (
  <span className={`inline-flex items-center gap-1 rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white uppercase ${className}`}>
    <ShieldCheck className="h-3 w-3" />
    Admin
  </span>
);

// onDark: light trigger for the transparent navbar over a hero (the dropdown itself stays white)
const AccountMenu = ({ onAuth, compact = false, onDark = false }) => {
  const { user, isAuthenticated, isAgent, isAdmin, isActive, statusLabel, logout } = useAuth();
  const inactiveAgent = isAgent && !isActive;
  const { toast } = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  useScrim(open, close); // blurs the page behind it on the public site (no-op in the dashboards)

  const handleLogout = async () => {
    try {
      await logout();
      close();
      toast({ title: "You've been signed out", type: "info" });
      if (pathname.startsWith("/account") || (pathname.startsWith("/agent/") && pathname !== "/agent/plans")) {
        navigate(isAgent ? "/agent/login" : "/login");
      }
    } catch (error) {
      toast({ title: "Could not sign out", description: error.message, type: "error" });
    }
  };

  const items = isAdmin ? adminItems : isAgent ? canAccessAgent(user) ? agentItems : [{ label: "Application status", to: "/agent/status", icon: ClipboardCheck }, { label: "Agent profile", to: "/agent/onboarding/profile", icon: UserRound }] : userItems;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={isAuthenticated ? `Account menu for ${user.name}` : "Account"}
        className={`flex items-center gap-2 rounded-full transition ${
          isAuthenticated && !compact ? `py-1 pr-3 pl-1 ${onDark ? "hover:bg-white/10" : "hover:bg-gray-100"}` : ""
        } ${open ? (onDark ? "bg-white/15" : "bg-gray-100") : ""}`}
      >
        {isAuthenticated ? (
          <span className="relative">
            <UserAvatar user={user} className="h-10 w-10 text-sm" />
            {isAgent && (
              <span className={`absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-white ${inactiveAgent ? "bg-amber-400" : "bg-emerald-500"}`} />
            )}
          </span>
        ) : (
          <span className={`grid h-10 w-10 place-items-center rounded-full ring-1 transition ${onDark ? "text-white ring-white/40 hover:bg-white/10" : "text-gray-700 ring-gray-200 hover:bg-gray-100"}`}>
            <UserRound className="h-5 w-5" />
          </span>
        )}
        {isAuthenticated && !compact && (
          <>
            <span className={`hidden max-w-32 truncate text-sm font-semibold xl:block ${onDark ? "text-white" : "text-gray-800"}`}>{user.firstName}</span>
            <ChevronDown className={`hidden h-4 w-4 transition-transform xl:block ${onDark ? "text-white/70" : "text-gray-500"} ${open ? "rotate-180" : ""}`} />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute top-full right-0 z-50 mt-3 w-[min(18rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl glass-panel shadow-2xl ring-1 shadow-gray-900/10 ring-gray-100"
          >
            {isAuthenticated ? (
              <>
                <div className="flex items-center gap-3 border-b border-gray-100 p-4">
                  <UserAvatar user={user} className="h-11 w-11 text-sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-gray-900">{user.name}</p>
                      {isAgent && <AgentBadge />}
                      {isAdmin && <AdminBadge />}
                    </div>
                    <p className="truncate text-sm text-gray-500">{user.email}</p>
                  </div>
                </div>

                {inactiveAgent && (
                  <Link
                    to="/agent/subscription"
                    onClick={close}
                    className="mx-2 mt-2 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Subscription {statusLabel.toLowerCase()} · Renew
                  </Link>
                )}

                <ul className="p-2">
                  {items.map((item) => (
                    <li key={item.label}>
                      <Link
                        to={item.to}
                        role="menuitem"
                        onClick={close}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                          item.highlight
                            ? "text-brand-700 hover:bg-brand-50"
                            : pathname === item.to
                              ? "bg-gray-100 text-gray-900"
                              : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                      >
                        <item.icon className={`h-4.5 w-4.5 ${item.highlight ? "text-brand-500" : "text-gray-400"}`} />
                        {item.label}
                        {item.badge && (
                          <span className="ml-auto rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">{item.badge}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-gray-100 p-2">
                  <button
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    <LogOut className="h-4.5 w-4.5" />
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <div className="p-2">
                <p className="px-3 pt-2 pb-3 text-sm text-gray-500">Save homes, track inquiries and list your own properties.</p>
                <button
                  role="menuitem"
                  onClick={() => {
                    close();
                    onAuth("login");
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                >
                  <LogIn className="h-4.5 w-4.5 text-gray-400" />
                  Sign In
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    close();
                    onAuth("signup");
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                >
                  <UserPlus className="h-4.5 w-4.5 text-brand-500" />
                  Create Account
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AccountMenu;
