import { useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Building2, CreditCard, Inbox, LayoutDashboard, Menu, MessageCircle, PlusSquare, X } from "lucide-react";
import { useUnreadMessages } from "../hooks/useUnreadMessages";
import AccountMenu from "../components/account/AccountMenu";
import SubscriptionBanner from "../components/agent/SubscriptionBanner";
import StatusBadge from "../components/ui/StatusBadge";
import { useAgent } from "../hooks/useAgent";
import { useRealEstate } from "../context/useRealEstate";
import { usePlatform } from "../context/usePlatform";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import PageLoader from "../components/ui/PageLoader";

const navItems = [
  { label: "Dashboard", to: "/agent/dashboard", icon: LayoutDashboard },
  { label: "My Properties", to: "/agent/properties", icon: Building2, end: true },
  { label: "Add Property", to: "/agent/properties/add", icon: PlusSquare },
  { label: "Messages", to: "/agent/messages", icon: MessageCircle, badge: "messages" },
  { label: "Inquiries", to: "/agent/inquiries", icon: Inbox, badge: "inquiries" },
  { label: "Subscription", to: "/agent/subscription", icon: CreditCard },
];

const Logo = () => (
  <Link to="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-base text-white shadow-lg shadow-brand-500/30">H</span>
    <span>
      <span className="text-gray-900">Home</span>
      <span className="text-brand-500">Base</span>
    </span>
  </Link>
);

const SidebarContent = ({ onNavigate }) => {
  const { user, myInquiries, permissions } = useAgent();
  const { isActive, isSuspended, subscription, plan } = permissions;
  const newInquiries = myInquiries.filter((inq) => inq.status === "New").length;
  const unreadMessages = useUnreadMessages("agent");
  const badges = { inquiries: newInquiries, messages: unreadMessages };

  return (
    <div className="flex h-full flex-col">
      <p className="px-3 pb-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">Agent workspace</p>
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive: active }) =>
              `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                active ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`
            }
          >
            {({ isActive: active }) => (
              <>
                <item.icon className={`h-5 w-5 ${active ? "text-brand-500" : "text-gray-400 group-hover:text-gray-600"}`} />
                {item.label}
                {item.badge && badges[item.badge] > 0 && (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">
                    {badges[item.badge]}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Plan summary */}
      <Link
        to="/agent/subscription"
        onClick={onNavigate}
        className="mt-6 block rounded-2xl bg-gray-900 p-4 text-white transition hover:bg-gray-800"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{plan?.name || user.subscription?.planName} plan</p>
          <StatusBadge status={isSuspended ? "Suspended" : subscription.statusLabel} tone={isActive ? (subscription.expiringSoon ? "amber" : "green") : "red"} />
        </div>
        <p className="mt-1 text-xs text-gray-400">
          {isSuspended ? "Contact support to restore access" : isActive ? `${subscription.daysRemaining} days remaining` : "Renew to restore your listings"}
        </p>
      </Link>

      <Link
        to="/"
        onClick={onNavigate}
        className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to website
      </Link>
    </div>
  );
};

const AgentLayout = () => {
  const { listingsReady } = useRealEstate();
  const { plansLoading } = usePlatform();
  const { permissions } = useAgent();
  const isActive = permissions.canCreateDraft;
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  useLockBodyScroll(menuOpen);

  return (
    <div className="min-h-dvh bg-gray-50">
      <ScrollRestoration />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="flex h-20 items-center px-6">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <SidebarContent />
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/85 backdrop-blur-lg">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:h-20 lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <button
                onClick={() => setMenuOpen(true)}
                aria-label="Open agent menu"
                aria-expanded={menuOpen}
                className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-gray-700 hover:bg-gray-100"
              >
                <Menu className="h-6 w-6" />
              </button>
              <Logo />
            </div>
            <p className="hidden text-sm text-gray-500 lg:block">Manage your listings, inquiries and plan</p>
            <div className="flex items-center gap-3">
              {isActive && (
                <Link to="/agent/properties/add" className="btn btn-primary hidden px-4 py-2.5 sm:inline-flex">
                  <PlusSquare className="h-4 w-4" />
                  Add Property
                </Link>
              )}
              <AccountMenu onAuth={() => {}} />
            </div>
          </div>
        </header>

        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
        >
          {/* The subscription page shows its own, more detailed expiry state */}
          {pathname !== "/agent/subscription" && <SubscriptionBanner />}
          {/* Wait for the role data (listings, inquiries) before showing pages */}
          {listingsReady && !plansLoading ? <Outlet /> : <PageLoader label="Loading your workspace..." />}
        </motion.main>
      </div>

      {/* Mobile sidebar drawer */}
      <AnimatePresence>
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-gray-950/50 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col bg-white shadow-2xl"
            >
              <div className="flex h-16 items-center justify-between border-b border-gray-100 px-5">
                <Logo />
                <button
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close agent menu"
                  className="grid h-10 w-10 place-items-center rounded-full text-gray-700 hover:bg-gray-100"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <SidebarContent onNavigate={() => setMenuOpen(false)} />
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AgentLayout;
