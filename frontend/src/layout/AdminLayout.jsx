import { useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  BarChart3,
  Bell,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  ExternalLink,
  Inbox,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Settings,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/useToast";
import { useRealEstate } from "../context/useRealEstate";
import { usePlatform } from "../context/usePlatform";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import PageLoader from "../components/ui/PageLoader";
import { getInitials } from "../utils/property";
import { useUnreadMessages } from "../hooks/useUnreadMessages";

const navItems = [
  { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Users", to: "/admin/users", icon: Users },
  { label: "Agents", to: "/admin/agents", icon: UserCog },
  { label: "Properties", to: "/admin/properties", icon: Building2, badge: "pending" },
  { label: "Inquiries", to: "/admin/inquiries", icon: Inbox, badge: "inquiries" },
  { label: "Messages", to: "/admin/messages", icon: MessageCircle, badge: "messages" },
  { label: "Subscriptions", to: "/admin/subscriptions", icon: CreditCard },
  { label: "Plans", to: "/admin/plans", icon: Layers },
  { label: "Reports", to: "/admin/reports", icon: BarChart3 },
  { label: "Settings", to: "/admin/settings", icon: Settings },
];

const Brand = ({ collapsed }) => (
  <Link to="/admin/dashboard" className="flex items-center gap-2.5">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-base font-extrabold text-white shadow-lg shadow-brand-500/40">H</span>
    {!collapsed && (
      <span className="leading-tight">
        <span className="block text-base font-extrabold text-white">HomeBase</span>
        <span className="block text-[11px] font-semibold tracking-wider text-gray-400 uppercase">Admin Console</span>
      </span>
    )}
  </Link>
);

// collapsed: icon rail. `rail` forces the rail (tablet/laptop widths) via CSS.
const SidebarNav = ({ collapsed, onNavigate, counts, variant = "main" }) => {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast({ title: "You've been signed out", type: "info" });
    navigate("/");
  };

  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const count = counts[item.badge] || 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
                } ${collapsed ? "justify-center" : ""}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span layoutId={`admin-nav-active-${variant}`} className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand-400" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
                  )}
                  <item.icon className={`h-5 w-5 shrink-0 ${isActive ? "text-brand-300" : ""}`} />
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {count > 0 &&
                    (collapsed ? (
                      <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-400" />
                    ) : (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">{count}</span>
                    ))}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-6 space-y-1 border-t border-white/10 pt-4">
        <Link
          to="/admin/settings#profile"
          onClick={onNavigate}
          title={collapsed ? "Admin profile" : undefined}
          className={`flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/5 ${collapsed ? "justify-center" : ""}`}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">{getInitials(user.name)}</span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{user.name}</span>
              <span className="block truncate text-xs text-gray-400">Administrator</span>
            </span>
          )}
        </Link>
        <button
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-400 transition hover:bg-red-500/10 hover:text-red-300 ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && "Logout"}
        </button>
      </div>
    </div>
  );
};

const AdminLayout = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();
  const { listings, inquiries, listingsReady } = useRealEstate();
  const { plansLoading, settingsReady } = usePlatform();
  const unreadMessages = useUnreadMessages("admin");
  useLockBodyScroll(menuOpen);

  const counts = {
    pending: listings.filter((p) => p.listing.state === "pending").length,
    inquiries: inquiries.filter((i) => i.status === "New").length,
    messages: unreadMessages,
  };
  const current = navItems.find((item) => pathname.startsWith(item.to));

  return (
    <div className="min-h-dvh bg-slate-100">
      <ScrollRestoration />

      {/* Sidebar: icon rail on tablets/laptops (md–xl) or when collapsed, full width on xl */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-gray-950 transition-[width] duration-300 md:flex ${collapsed ? "w-20" : "w-20 xl:w-72"}`}
      >
        <div className="flex h-20 items-center px-5">
          <span className="xl:hidden"><Brand collapsed /></span>
          <span className="hidden xl:block"><Brand collapsed={collapsed} /></span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-5">
          <div className="xl:hidden"><SidebarNav collapsed counts={counts} variant="rail" /></div>
          <div className="hidden h-full xl:block"><SidebarNav collapsed={collapsed} counts={counts} /></div>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute top-24 -right-3 hidden h-6 w-6 place-items-center rounded-full bg-white text-gray-700 shadow ring-1 ring-gray-200 hover:text-gray-900 xl:grid"
        >
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>

      <div className={`transition-[padding] duration-300 md:pl-20 ${collapsed ? "" : "xl:pl-72"}`}>
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100/85 backdrop-blur-lg">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:h-20 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setMenuOpen(true)}
                aria-label="Open admin menu"
                aria-expanded={menuOpen}
                className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-gray-700 hover:bg-white md:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wider text-gray-400 uppercase">Admin</p>
                <p className="truncate text-lg font-bold text-gray-900">{current?.label || "Console"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/admin/properties?status=pending"
                aria-label={`${counts.pending} properties awaiting review`}
                className="relative grid h-10 w-10 place-items-center rounded-full text-gray-600 transition hover:bg-white hover:text-gray-900"
              >
                <Bell className="h-5 w-5" />
                {counts.pending > 0 && (
                  <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{counts.pending}</span>
                )}
              </Link>
              <Link to="/" className="btn btn-light hidden px-4 py-2.5 sm:inline-flex">
                <ExternalLink className="h-4 w-4" />
                View site
              </Link>
            </div>
          </div>
        </header>

        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
        >
          {/* Wait for the role data (listings, inquiries) before showing pages */}
          {listingsReady && !plansLoading && settingsReady ? <Outlet /> : <PageLoader label="Loading the admin console..." />}
        </motion.main>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-gray-950/60 backdrop-blur-sm" />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col bg-gray-950"
            >
              <div className="flex h-16 items-center justify-between px-5">
                <Brand />
                <button onClick={() => setMenuOpen(false)} aria-label="Close admin menu" className="grid h-10 w-10 place-items-center rounded-full text-gray-300 hover:bg-white/10">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <SidebarNav counts={counts} onNavigate={() => setMenuOpen(false)} variant="drawer" />
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminLayout;
