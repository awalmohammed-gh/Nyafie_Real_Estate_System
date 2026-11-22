import { useEffect, useState } from "react";
import { Building, ClipboardCheck, Clock, CreditCard, Database, FileClock, HandCoins, House, Inbox, MessageCircle, Star, UserCog, Users, Wallet } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { usePlatform } from "../../context/usePlatform";
import { useApiQuery } from "../../hooks/useApiQuery";
import { adminApi } from "../../frontApi";
import { DashboardSkeleton, ErrorState } from "../../components/dashboard/States";
import { AttentionQueue, CounterList, InventorySummary, MetricGrid, OverviewHeader, PopularListings, RevenueSources, SectionHeading } from "../../components/admin/OverviewSections";
import PerformanceChart from "../../components/admin/PerformanceChart";
import { formatCedis } from "../../utils/reports";
import { adminPath } from "../../utils/adminEntry";
import "./adminOverview.css";

const REFRESH_MS = 60000; // same cadence as the sidebar's badges

/**
 * Admin overview: key numbers, the work waiting on the team, platform performance over time,
 * then compact summaries. Built from GET /api/admin/dashboard (+ /performance for the chart).
 */
const AdminDashboard = () => {
  const { user } = useAuth();
  const { siteName } = usePlatform();
  const [months, setMonths] = useState(6);
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
    <OverviewHeader name={user?.firstName} siteName={siteName} generatedAt={data?.generatedAt} loading={query.loading} onRefresh={reload} months={months} onMonthsChange={setMonths} />
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
      label: "Recorded receipts",
      value: `GH₵${Number(revenue.last30).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      hint: revenue.change !== null ? `Previous 30 days: ${formatCedis(revenue.previous30)}` : "Confirmed payments received",
      change: revenue.change,
      tone: "violet",
      icon: Database,
      to: adminPath("/payments"),
      toLabel: "View payments",
    },
    {
      label: "Live listings",
      value: live.toLocaleString(),
      hint: properties.inReview ? `${properties.inReview} awaiting review · ${properties.addedThisMonth} added this month` : `${properties.addedThisMonth} added this month · ${properties.total} in total`,
      attention: properties.inReview > 0,
      icon: House,
      tone: "teal",
      to: adminPath("/properties"),
      toLabel: "Manage properties",
    },
    {
      label: "Active agents",
      value: agents.active.toLocaleString(),
      hint: agents.pendingApplications
        ? `${agents.pendingApplications} ${agents.pendingApplications === 1 ? "application" : "applications"} awaiting review`
        : `${agents.total} registered${agents.expiringSoon ? ` · ${agents.expiringSoon} expiring soon` : ""}`,
      attention: agents.pendingApplications > 0,
      icon: Users,
      tone: "amber",
      to: agents.pendingApplications ? adminPath("/agent-applications") : adminPath("/agents"),
      toLabel: agents.pendingApplications ? "Review applications" : "Manage agents",
    },
    {
      label: "Customers",
      value: customers.total.toLocaleString(),
      hint: customers.newLast30Days ? `+${customers.newLast30Days} in the last 30 days` : "None new in the last 30 days",
      icon: Users,
      tone: "blue",
      to: adminPath("/customers"),
      toLabel: "View customers",
    },
  ];

  // Most urgent first. label: [singular, plural]; items with a count of 0 are left out
  const attention = [
    { icon: ClipboardCheck, count: agents.pendingApplications, label: ["agent application to review", "agent applications to review"], hint: "Profile and subscription complete, waiting for approval", to: adminPath("/agent-applications"), tone: "amber", action: "Review" },
    { icon: FileClock, count: properties.inReview, label: ["listing awaiting review", "listings awaiting review"], hint: "Approve or reject agent submissions", to: adminPath("/properties?status=pending"), tone: "amber", action: "Review" },
    { icon: CreditCard, count: deals.rentalsToConfirm, label: ["paid rental to confirm", "paid rentals to confirm"], hint: "Payment received on Paystack", to: adminPath("/rentals"), tone: "brand", action: "Confirm" },
    { icon: Wallet, count: deals.officePaymentsExpected, label: ["sale payment expected", "sale payments expected"], hint: "Confirm once the buyer has paid", to: adminPath("/sale-requests"), tone: "brand", action: "Open" },
    { icon: HandCoins, count: deals.pendingOffers, label: ["offer awaiting a response", "offers awaiting a response"], hint: "Customers are waiting to hear back", to: adminPath("/offers"), tone: "brand", action: "Respond" },
    { icon: Building, count: deals.newPurchaseRequests, label: ["new purchase request", "new purchase requests"], hint: "Contact the buyer with next steps", to: adminPath("/sale-requests"), tone: "sky", action: "Contact" },
    { icon: Inbox, count: deals.newInquiries, label: ["new inquiry", "new inquiries"], hint: "Not answered yet", to: adminPath("/inquiries?status=New"), tone: "sky", action: "Reply" },
    { icon: MessageCircle, count: data.unreadMessages, label: ["unread message", "unread messages"], hint: "Conversations about your listings", to: adminPath("/messages"), tone: "sky", action: "Reply" },
    { icon: Star, count: data.reviews?.new || 0, label: ["new customer review", "new customer reviews"], hint: "Check them and hide anything inappropriate", to: adminPath("/reviews"), tone: "gray", action: "Moderate" },
    { icon: Clock, count: agents.expiringSoon, label: ["agent plan expiring soon", "agent plans expiring soon"], hint: "Within the next 7 days", to: adminPath("/subscriptions?status=expiring"), tone: "gray", action: "Manage" },
  ].filter((item) => item.count > 0);
  const attentionTotal = attention.reduce((sum, item) => sum + item.count, 0);

  const counters = [
    { label: "Pending offers", value: deals.pendingOffers, to: adminPath("/offers"), icon: HandCoins },
    { label: "Rentals to confirm", value: deals.rentalsToConfirm, to: adminPath("/rentals"), icon: CreditCard },
    { label: "Purchases in progress", value: deals.purchasesInProgress, to: adminPath("/sale-requests"), icon: Building },
    { label: "Unanswered inquiries", value: deals.newInquiries, to: adminPath("/inquiries?status=New"), icon: Inbox },
  ];

  return (
    <div className="admin-overview">
      {header}
      <MetricGrid items={metrics} />
      <div className="overview-primary-grid">
        <div className="overview-chart-column"><PerformanceChart refreshKey={data.generatedAt} months={months} onMonthsChange={setMonths} /></div>
        <AttentionQueue items={attention} total={attentionTotal} summary={[
          { icon: UserCog, count: agents.pendingApplications, label: "Pending agent applications", to: adminPath("/agent-applications") },
          { icon: Inbox, count: properties.inReview, label: "Properties in review", to: adminPath("/properties?status=pending") },
          { icon: Inbox, count: deals.newInquiries, label: "Unanswered inquiries", to: adminPath("/inquiries?status=New") },
          { icon: CreditCard, count: deals.rentalsToConfirm + deals.officePaymentsExpected, label: "Payment confirmations", to: adminPath("/payments") },
        ]} />
      </div>
      <div className="overview-secondary-grid">
        <InventorySummary properties={properties} />
        <section className="overview-panel">
          <SectionHeading title="Deals in progress" to={adminPath("/reports")} toLabel="Reports" />
          <CounterList items={counters} />
        </section>
        <RevenueSources revenue={revenue} />
      </div>
      <PopularListings properties={properties} siteName={siteName} />
    </div>
  );
};

export default AdminDashboard;
