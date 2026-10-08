import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Building, Building2, ClipboardCheck, Clock, CreditCard, FileClock, HandCoins, Inbox, MessageCircle, Plus, Star, UserCog, Users, Wallet } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { usePlatform } from "../../context/usePlatform";
import { useApiQuery } from "../../hooks/useApiQuery";
import { adminApi } from "../../frontApi";
import { PageHeader, Panel } from "../../components/dashboard/Page";
import { Breakdown } from "../../components/dashboard/Metrics";
import { AllClear } from "../../components/dashboard/Overview";
import { DashboardSkeleton, ErrorState } from "../../components/dashboard/States";
import { AttentionItems, CounterList, MetricGrid, RevenueSources } from "../../components/admin/OverviewSections";
import PerformanceChart from "../../components/admin/PerformanceChart";
import { formatCedis } from "../../utils/reports";

const REFRESH_MS = 60000; // same cadence as the sidebar's badges

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};
const signedChange = (change) => `${change > 0 ? "+" : ""}${change}%`;

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

  useEffect(() => {
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const header = (
    <PageHeader
      eyebrow={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      title={`${greeting()}, ${user.firstName}`}
      description={`What needs doing across ${siteName}, and how the platform is performing.`}
      actions={
        <Link to="/admin/properties/add" className="btn btn-primary min-h-11 px-4">
          <Plus className="h-4 w-4" />
          Add property
        </Link>
      }
    />
  );

  if (!data) {
    return query.error ? (
      <>
        {header}
        <ErrorState title="Couldn't load the dashboard" message={query.error} onRetry={reload} />
      </>
    ) : (
      <DashboardSkeleton />
    );
  }

  const { properties, agents, customers, deals, revenue } = data;
  const live = properties.published - properties.hidden;

  const metrics = [
    {
      label: "Revenue, last 30 days",
      value: formatCedis(revenue.last30),
      hint: revenue.change !== null ? `${signedChange(revenue.change)} vs the 30 days before (${formatCedis(revenue.previous30)})` : `${formatCedis(revenue.total)} collected since launch`,
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
      to: agents.pendingApplications ? "/admin/agent-applications" : "/admin/agents",
      toLabel: agents.pendingApplications ? "Review applications" : "Manage agents",
    },
    {
      label: "Customers",
      value: customers.total.toLocaleString(),
      hint: customers.newLast30Days ? `+${customers.newLast30Days} in the last 30 days` : "None new in the last 30 days",
      icon: Users,
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
    { icon: MessageCircle, count: data.unreadMessages, label: ["unread message", "unread messages"], hint: "About HomeBase listings", to: "/admin/messages", tone: "sky", action: "Reply" },
    { icon: Star, count: data.reviews?.new || 0, label: ["new customer review", "new customer reviews"], hint: "Check them and hide anything inappropriate", to: "/admin/reviews", tone: "gray", action: "Moderate" },
    { icon: Clock, count: agents.expiringSoon, label: ["agent plan expiring soon", "agent plans expiring soon"], hint: "Within the next 7 days", to: "/admin/subscriptions?status=expiring", tone: "gray", action: "Manage" },
  ].filter((item) => item.count > 0);
  const attentionTotal = attention.reduce((sum, item) => sum + item.count, 0);

  const counters = [
    { label: "Offers awaiting a response", value: deals.pendingOffers, to: "/admin/offers" },
    { label: "Rentals to confirm", value: deals.rentalsToConfirm, to: "/admin/rentals" },
    { label: "Purchases in progress", value: deals.purchasesInProgress, to: "/admin/sale-requests" },
    { label: "Unanswered inquiries", value: deals.newInquiries, to: "/admin/inquiries?status=New" },
  ];

  return (
    <>
      {header}

      <MetricGrid items={metrics} />

      <div className="mt-6">
        {attention.length ? (
          <Panel title="Needs attention" description={`${attentionTotal} ${attentionTotal === 1 ? "item is" : "items are"} waiting on the ${siteName} team`} bodyClassName="">
            <AttentionItems items={attention} />
          </Panel>
        ) : (
          <AllClear>All clear. Agent applications, listings to review, offers and payments to confirm will show up here.</AllClear>
        )}
      </div>

      <div className="mt-6">
        <PerformanceChart />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Inventory" description={`${properties.total} ${properties.total === 1 ? "property" : "properties"} on the platform`} to="/admin/properties" toLabel="Manage">
          <p className="mb-4 text-xs text-gray-500">
            {properties.published} published · {properties.inReview} in review · {properties.drafts} {properties.drafts === 1 ? "draft" : "drafts"}
            {properties.hidden > 0 && ` · ${properties.hidden} hidden (agent plan lapsed)`}
          </p>
          <Breakdown
            total={properties.available + properties.underOffer + properties.rented + properties.sold}
            segments={[
              { label: "Available", value: properties.available, className: "bg-emerald-400" },
              { label: "Under offer", value: properties.underOffer, className: "bg-amber-300" },
              { label: "Rented", value: properties.rented, className: "bg-sky-400" },
              { label: "Sold", value: properties.sold, className: "bg-gray-400" },
            ]}
          />
        </Panel>
        <Panel title="Deals in progress" description="Open work across all listings" bodyClassName="">
          <CounterList items={counters} />
        </Panel>
        <Panel title="Revenue by source" description="Everything collected so far" to="/admin/payments" toLabel="Payments" bodyClassName="" className="md:col-span-2 xl:col-span-1">
          <RevenueSources revenue={revenue} />
        </Panel>
      </div>
    </>
  );
};

export default AdminDashboard;
