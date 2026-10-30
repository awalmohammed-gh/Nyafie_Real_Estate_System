import { useEffect } from "react";
import { Building, Building2, ClipboardCheck, Clock, CreditCard, FileClock, HandCoins, Inbox, MessageCircle, Star, UserCog, Users, Wallet } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { usePlatform } from "../../context/usePlatform";
import { useApiQuery } from "../../hooks/useApiQuery";
import { adminApi } from "../../frontApi";
import { DashboardSkeleton, ErrorState } from "../../components/dashboard/States";
import { AttentionQueue, CounterList, InventorySummary, MetricGrid, OverviewHeader, PopularListings, RevenueSources, SectionHeading } from "../../components/admin/OverviewSections";
import PerformanceChart from "../../components/admin/PerformanceChart";
import { formatCedis } from "../../utils/reports";
import "./adminOverview.css";

const REFRESH_MS = 60000; // same cadence as the sidebar's badges

/**
 * Admin overview: key numbers, the work waiting on the team, platform performance over time,
 * then compact summaries. Built from GET /api/admin/dashboard (+ /performance for the chart).
 */
const AdminDashboard = () => {
  const { user } = useAuth();
  const { siteName } = usePlatform();
  const query = useApiQuery("admin-dashboard", adminApi.getAdminDashboard);
  const { reload } = query;
  // Keep the last result on screen while a refresh runs
  const data = query.data ?? query.previous;

  // Live figures: every minute while open, and straight away when the admin returns to the tab
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && reload(), REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const header = (
    <OverviewHeader name={user?.firstName} siteName={siteName} generatedAt={data?.generatedAt} loading={query.loading} onRefresh={reload} />
  );

  if (!data) {
    return query.error ? (
      <div className="admin-overview">
        {header}
        <ErrorState title="Couldn't load the dashboard" message={query.error} onRetry={reload} />
      </div>
    ) : (
      <div className="admin-overview">{header}<DashboardSkeleton /></div>
    );
  }

  const { properties, agents, customers, deals, revenue } = data;
  const live = Math.max(0, properties.published - properties.hidden);

  const metrics = [
    {
      label: "Revenue · last 30 days",
      value: formatCedis(revenue.last30),
      hint: revenue.change !== null ? `Previous 30 days: ${formatCedis(revenue.previous30)}` : "Confirmed payments received",
      change: revenue.change,
      tone: "violet",
      icon: Wallet,
      to: "/admin/payments",
      toLabel: "View payments",
    },
    {
      label: "Live listings",
      value: live.toLocaleString(),
      hint: properties.inReview ? `${properties.inReview} awaiting review · ${properties.addedThisMonth} added this month` : `${properties.addedThisMonth} added this month · ${properties.total} in total`,
      attention: properties.inReview > 0,
      icon: Building2,
      tone: "teal",
      to: "/admin/properties",
      toLabel: "Manage properties",
    },
    {
      label: "Active agents",
      value: agents.active.toLocaleString(),
      hint: agents.pendingApplications
        ? `${agents.pendingApplications} ${agents.pendingApplications === 1 ? "application" : "applications"} awaiting review`
        : `${agents.total} registered${agents.expiringSoon ? ` · ${agents.expiringSoon} expiring soon` : ""}`,
      attention: agents.pendingApplications > 0,
      icon: UserCog,
      tone: "amber",
      to: agents.pendingApplications ? "/admin/agent-applications" : "/admin/agents",
      toLabel: agents.pendingApplications ? "Review applications" : "Manage agents",
    },
    {
      label: "Customers",
      value: customers.total.toLocaleString(),
      hint: customers.newLast30Days ? `+${customers.newLast30Days} in the last 30 days` : "None new in the last 30 days",
      icon: Users,
      tone: "blue",
      to: "/admin/customers",
      toLabel: "View customers",
    },
  ];

  // Most urgent first. label: [singular, plural]; items with a count of 0 are left out
  const attention = [
    { icon: ClipboardCheck, count: agents.pendingApplications, label: ["agent application to review", "agent applications to review"], hint: "Profile and subscription complete, waiting for approval", to: "/admin/agent-applications", tone: "amber", action: "Review" },
    { icon: FileClock, count: properties.inReview, label: ["listing awaiting review", "listings awaiting review"], hint: "Approve or reject agent submissions", to: "/admin/properties?status=pending", tone: "amber", action: "Review" },
    { icon: CreditCard, count: deals.rentalsToConfirm, label: ["paid rental to confirm", "paid rentals to confirm"], hint: "Payment received on Paystack", to: "/admin/rentals", tone: "brand", action: "Confirm" },
    { icon: Wallet, count: deals.officePaymentsExpected, label: ["office payment expected", "office payments expected"], hint: "Confirm once the buyer has paid", to: "/admin/sale-requests", tone: "brand", action: "Open" },
    { icon: HandCoins, count: deals.pendingOffers, label: ["offer awaiting a response", "offers awaiting a response"], hint: "Customers are waiting to hear back", to: "/admin/offers", tone: "brand", action: "Respond" },
    { icon: Building, count: deals.newPurchaseRequests, label: ["new purchase request", "new purchase requests"], hint: "Contact the buyer with next steps", to: "/admin/sale-requests", tone: "sky", action: "Contact" },
    { icon: Inbox, count: deals.newInquiries, label: ["new inquiry", "new inquiries"], hint: "Not answered yet", to: "/admin/inquiries?status=New", tone: "sky", action: "Reply" },
    { icon: MessageCircle, count: data.unreadMessages, label: ["unread message", "unread messages"], hint: "Conversations about your listings", to: "/admin/messages", tone: "sky", action: "Reply" },
    { icon: Star, count: data.reviews?.new || 0, label: ["new customer review", "new customer reviews"], hint: "Check them and hide anything inappropriate", to: "/admin/reviews", tone: "gray", action: "Moderate" },
    { icon: Clock, count: agents.expiringSoon, label: ["agent plan expiring soon", "agent plans expiring soon"], hint: "Within the next 7 days", to: "/admin/subscriptions?status=expiring", tone: "gray", action: "Manage" },
  ].filter((item) => item.count > 0);
  const attentionTotal = attention.reduce((sum, item) => sum + item.count, 0);

  const counters = [
    { label: "Pending offers", value: deals.pendingOffers, to: "/admin/offers", icon: HandCoins },
    { label: "Rentals to confirm", value: deals.rentalsToConfirm, to: "/admin/rentals", icon: CreditCard },
    { label: "Purchases in progress", value: deals.purchasesInProgress, to: "/admin/sale-requests", icon: Building },
    { label: "Unanswered inquiries", value: deals.newInquiries, to: "/admin/inquiries?status=New", icon: Inbox },
  ];

  return (
    <div className="admin-overview">
      {header}
      <MetricGrid items={metrics} />
      <div className="overview-primary-grid">
        <div className="overview-chart-column"><PerformanceChart refreshKey={data.generatedAt} /></div>
        <AttentionQueue items={attention} total={attentionTotal} />
      </div>
      <div className="overview-secondary-grid">
        <InventorySummary properties={properties} />
        <section className="overview-panel">
          <SectionHeading title="Deals in progress" description="Your open pipeline" to="/admin/reports" toLabel="Reports" />
          <CounterList items={counters} />
          <p className="overview-pipeline-note">Open a category to manage the next step.</p>
        </section>
        <RevenueSources revenue={revenue} />
      </div>
      <PopularListings properties={properties} siteName={siteName} />
    </div>
  );
};

export default AdminDashboard;
