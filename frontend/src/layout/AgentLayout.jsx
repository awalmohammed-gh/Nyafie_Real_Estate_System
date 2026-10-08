import { Link, useLocation } from "react-router-dom";
import { Building, Building2, CreditCard, HandCoins, Inbox, KeyRound, LayoutDashboard, MessageCircle, LifeBuoy, PlusSquare, Settings } from "lucide-react";
import { useUnreadMessages } from "../hooks/useUnreadMessages";
import { useAgent } from "../hooks/useAgent";
import { useRealEstate } from "../context/useRealEstate";
import { usePlatform } from "../context/usePlatform";
import { TransactionsProvider } from "../context/TransactionsProvider";
import { useTransactions } from "../context/useTransactions";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import PageLoader from "../components/ui/PageLoader";
import AccountMenu from "../components/account/AccountMenu";
import NotificationBell from "../components/ui/NotificationBell";
import SubscriptionBanner from "../components/agent/SubscriptionBanner";
import SidebarAccount from "../components/dashboard/SidebarAccount";
import "../pages/agent/workspace.css";

// Built around the agent's day: their listings and customers first, then requests, account and help.
// Each item points to an agent workspace route or the public support page.
const groups = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", to: "/agent/dashboard", icon: LayoutDashboard },
      // Includes a property's own page, but not "Add Property"
      { label: "My Properties", to: "/agent/properties", icon: Building2, match: (l) => l.pathname.startsWith("/agent/properties") && l.pathname !== "/agent/properties/add" },
      { label: "Add Property", to: "/agent/properties/add", icon: PlusSquare, end: true },
    ],
  },
  {
    label: "Customers",
    items: [
      { label: "Inquiries", to: "/agent/inquiries", icon: Inbox, badge: "inquiries" },
      { label: "Offers", to: "/agent/offers", icon: HandCoins, badge: "offers" },
      { label: "Rental Requests", to: "/agent/rentals", icon: KeyRound, badge: "rentals" },
      { label: "Sale Requests", to: "/agent/sale-requests", icon: Building, badge: "sales" },
      { label: "Messages", to: "/agent/messages", icon: MessageCircle, badge: "messages" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Subscription", to: "/agent/subscription", icon: CreditCard },
      { label: "Settings", to: "/agent/settings", icon: Settings },
    ],
  },
  {
    label: "Support",
    items: [{ label: "Help & Support", to: "/contact", icon: LifeBuoy }],
  },
];

// Plan status in the sidebar footer
const PlanSummary = () => {
  const { user, permissions } = useAgent();
  const { isActive, isSuspended, subscription, plan } = permissions;
  const tone = isSuspended || !isActive ? "bg-red-500" : subscription.expiringSoon ? "bg-amber-500" : "bg-emerald-500";
  return (
    <Link to="/agent/subscription" className="block rounded-md px-2.5 py-2 transition-colors hover:bg-gray-100">
      <p className="flex items-center gap-2 text-xs font-semibold text-gray-900">
        <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
        {plan?.name || user.subscription?.planName || "No"} plan
      </p>
      <p className="mt-0.5 text-[11px] text-gray-500">
        {isSuspended ? "Account suspended" : isActive ? `${user.subscription ? `${subscription.daysRemaining} days left · ` : ""}${permissions.activeCount}/${permissions.propertyLimit} listings` : "Renew to restore your listings"}
      </p>
    </Link>
  );
};

const AgentShell = () => {
  const { listingsReady } = useRealEstate();
  const { plansLoading } = usePlatform();
  const { myInquiries, permissions } = useAgent();
  const { pending } = useTransactions();
  const unreadMessages = useUnreadMessages("agent");
  const { pathname } = useLocation();

  const badges = {
    inquiries: myInquiries.filter((inq) => inq.status === "New").length,
    messages: unreadMessages,
    offers: pending.offers,
    rentals: pending.rentals,
    sales: pending.sales,
  };

  return (
    <DashboardLayout
      variant="agent"
      label="Agent workspace"
      groups={groups}
      badges={badges}
      ready={listingsReady && !plansLoading}
      fallback={<PageLoader label="Loading your workspace..." />}
      sidebarFooter={<div className="space-y-2"><PlanSummary /><SidebarAccount roleLabel="Agent" /></div>}
      // The subscription page shows its own, more detailed expiry state
      banner={pathname !== "/agent/subscription" && <SubscriptionBanner />}
      headerActions={
        <>
          {permissions.canCreateDraft && !["/agent/properties/add", "/agent/dashboard"].includes(pathname) && (
            <Link to="/agent/properties/add" className="btn btn-primary hidden px-3.5 py-2 sm:inline-flex">
              <PlusSquare className="h-4 w-4" />
              Add Property
            </Link>
          )}
          <NotificationBell />
          <AccountMenu onAuth={() => {}} />
        </>
      }
    />
  );
};

const AgentLayout = () => (
  <TransactionsProvider scope="agent">
    <AgentShell />
  </TransactionsProvider>
);

export default AgentLayout;
