import { Link } from "react-router-dom";
import {
  BarChart3,
  Building,
  Building2,
  ClipboardCheck,
  CreditCard,
  ExternalLink,
  HandCoins,
  Inbox,
  KeyRound,
  Layers,
  LayoutDashboard,
  MessageCircle,
  Settings,
  Star,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { useRealEstate } from "../context/useRealEstate";
import { usePlatform } from "../context/usePlatform";
import { TransactionsProvider } from "../context/TransactionsProvider";
import { useTransactions } from "../context/useTransactions";
import { useUnreadMessages } from "../hooks/useUnreadMessages";
import { useUnseenReviews } from "../hooks/useUnseenReviews";
import { usePendingApplications } from "../hooks/usePendingApplications";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { DashboardSkeleton } from "../components/dashboard/States";
import NotificationBell from "../components/ui/NotificationBell";
import AccountMenu from "../components/account/AccountMenu";
import SidebarAccount from "../components/dashboard/SidebarAccount";

// Grouped the way the platform is run: the portfolio, the deals in progress, the conversations
// with customers, the money, and the system itself. Only routes that exist in the admin console.
const groups = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard },
      { label: "Reports", to: "/admin/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Real estate",
    items: [
      { label: "Properties", to: "/admin/properties", icon: Building2, badge: "review", urgent: true },
      { label: "Agents", to: "/admin/agents", icon: UserCog },
      { label: "Agent Applications", to: "/admin/agent-applications", icon: ClipboardCheck, badge: "applications", urgent: true },
      { label: "Customers", to: "/admin/customers", icon: Users },
    ],
  },
  {
    label: "Deals",
    items: [
      { label: "Offers", to: "/admin/offers", icon: HandCoins, badge: "offers" },
      { label: "Rentals", to: "/admin/rentals", icon: KeyRound, badge: "rentals" },
      { label: "Sales", to: "/admin/sale-requests", icon: Building, badge: "sales" },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "Inquiries", to: "/admin/inquiries", icon: Inbox, badge: "inquiries" },
      { label: "Messages", to: "/admin/messages", icon: MessageCircle, badge: "messages" },
      { label: "Reviews", to: "/admin/reviews", icon: Star, badge: "reviews" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Payments", to: "/admin/payments", icon: Wallet },
      { label: "Subscriptions", to: "/admin/subscriptions", icon: CreditCard },
      { label: "Plans", to: "/admin/plans", icon: Layers },
    ],
  },
  {
    label: "System",
    items: [{ label: "Settings", to: "/admin/settings", icon: Settings }],
  },
];

const AdminShell = () => {
  const { listings, inquiries, listingsReady } = useRealEstate();
  const { plansLoading, settingsReady } = usePlatform();
  const { pending } = useTransactions();
  const unreadMessages = useUnreadMessages("admin");
  const newReviews = useUnseenReviews();
  const pendingApplications = usePendingApplications();
  const review = listings.filter((p) => p.listing.state === "pending").length;

  const badges = {
    review,
    applications: pendingApplications,
    inquiries: inquiries.filter((i) => i.status === "New").length,
    messages: unreadMessages,
    reviews: newReviews,
    offers: pending.offers,
    rentals: pending.rentals,
    sales: pending.sales,
  };

  return (
    <DashboardLayout
      variant="admin"
      label="Admin console"
      groups={groups}
      badges={badges}
      ready={listingsReady && !plansLoading && settingsReady}
      fallback={<DashboardSkeleton />}
      sidebarFooter={<SidebarAccount roleLabel="Administrator" tone="dark" />}
      headerActions={
        <>
          <Link
            to="/admin/properties?status=pending"
            title="Properties awaiting review"
            aria-label={`${review} properties awaiting review`}
            className="relative grid h-10 w-10 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <ClipboardCheck className="h-5 w-5" />
            {review > 0 && <span className="absolute top-1 right-1 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] leading-4 font-bold text-white">{review}</span>}
          </Link>
          <NotificationBell />
          <Link to="/" title="View website" aria-label="View website" className="hidden h-10 w-10 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 sm:grid">
            <ExternalLink className="h-4.5 w-4.5" />
          </Link>
          <span className="mx-1 hidden h-6 w-px bg-gray-200 sm:block" />
          <AccountMenu onAuth={() => {}} />
        </>
      }
    />
  );
};

const AdminLayout = () => (
  <TransactionsProvider scope="admin">
    <AdminShell />
  </TransactionsProvider>
);

export default AdminLayout;
