import { Link, useNavigate } from "react-router-dom";
import { Building, Building2, Clock, CreditCard, FileClock, HandCoins, Inbox, MessageCircle, Plus, Receipt, UserCog, Wallet } from "lucide-react";
import { useAdminData } from "../../hooks/useAdminData";
import { useTransactions } from "../../context/useTransactions";
import { useUnreadMessages } from "../../hooks/useUnreadMessages";
import { useApiQuery } from "../../hooks/useApiQuery";
import { usePlatform } from "../../context/usePlatform";
import { paymentApi } from "../../frontApi";
import { PageHeader, Panel } from "../../components/dashboard/Page";
import { Breakdown } from "../../components/dashboard/Metrics";
import { AllClear, Band, FigureRow, MiniBars, SectionTitle, Zone } from "../../components/dashboard/Overview";
import AttentionList from "../../components/dashboard/Attention";
import ActivityFeed from "../../components/dashboard/ActivityFeed";
import PropertyTile from "../../components/dashboard/PropertyTile";
import { ErrorState } from "../../components/dashboard/States";
import StatusBadge from "../../components/ui/StatusBadge";
import { buildActivity } from "../../utils/activity";
import { formatDate, formatRelative, isWithinDays } from "../../utils/date";
import { getInitials, getListingStatus } from "../../utils/property";
import { formatCedis, lastMonths } from "../../utils/reports";

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};

const OPEN_SALE = ["pending", "contacted", "offer_received", "negotiating", "approved", "payment_pending"];
const KIND = {
  rental: { label: "Rental", tone: "sky" },
  sale: { label: "Property sale", tone: "green" },
  subscription: { label: "Subscription", tone: "brand" },
};
const cap = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);
const SUB_TONE = { active: "bg-emerald-500", expiring: "bg-amber-400", expired: "bg-red-500", cancelled: "bg-gray-300", pending: "bg-amber-400", none: "bg-gray-300" };

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { siteName } = usePlatform();
  const { users, agents, listings, payments: subscriptionPayments, pendingListings, newInquiries, ownerOf, user, findProperty, inquiries, getPlan, isPubliclyVisible } = useAdminData();
  const { offers, rentals, sales, pending, loading, error, reload } = useTransactions();
  const unreadMessages = useUnreadMessages("admin");
  const ledger = useApiQuery("admin-payments", paymentApi.getAdminPayments);

  // ---- People: customers only (the admin and agents are not customers)
  const customers = users.filter((u) => u.role === "user");
  const newCustomers = customers.filter((u) => isWithinDays(u.createdAt, 30)).length;
  const activeAgents = agents.filter((a) => a.sub.isActive && a.status !== "suspended");
  const expiring = agents.filter((a) => a.sub.expiringSoon);

  // ---- Inventory
  const byAvailability = (a) => listings.filter((p) => p.listing.availability === a).length;
  const byState = (s) => listings.filter((p) => p.listing.state === s).length;

  // ---- Money actually collected (rental payments online, office sale payments, agent subscriptions)
  const transactions = [
    ...(ledger.data || []).map((p) => ({
      id: p.id,
      kind: p.kind,
      party: p.customer,
      subject: p.property,
      amount: p.amount,
      status: p.status,
      date: p.paidAt || p.createdAt,
    })),
    ...subscriptionPayments.map((p) => ({
      id: p.id,
      kind: "subscription",
      party: users.find((u) => u.id === p.userId)?.name || "Deleted agent",
      subject: `${getPlan(p.planId)?.name || "Plan"} plan`,
      amount: p.amount,
      status: cap(p.status),
      date: p.createdAt,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  const collected = transactions.filter((t) => t.status === "Paid");
  const sumOf = (kind) => collected.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0);
  const totalCollected = collected.reduce((s, t) => s + t.amount, 0);
  const last30 = collected.filter((t) => isWithinDays(t.date, 30)).reduce((s, t) => s + t.amount, 0);
  const monthly = lastMonths(6).map(({ start, end, label }) => ({
    label,
    value: collected.filter((t) => new Date(t.date) >= start && new Date(t.date) < end).reduce((s, t) => s + t.amount, 0),
  }));

  const attention = [
    { icon: FileClock, count: pendingListings.length, label: ["listing awaiting review", "listings awaiting review"], hint: "Approve or reject agent submissions", to: "/admin/properties?status=pending", tone: "amber", action: "Review" },
    { icon: HandCoins, count: pending.offers, label: ["offer awaiting a response", "offers awaiting a response"], hint: "Customers are waiting to hear back", to: "/admin/offers", tone: "brand", action: "Respond" },
    { icon: CreditCard, count: pending.rentals, label: ["paid rental to confirm", "paid rentals to confirm"], hint: "Payment received on Paystack", to: "/admin/rentals", tone: "brand", action: "Confirm" },
    { icon: Building, count: pending.sales, label: ["new purchase request", "new purchase requests"], hint: "Contact the buyer with next steps", to: "/admin/sale-requests", tone: "amber", action: "Contact" },
    { icon: Wallet, count: pending.officePayments, label: ["office payment expected", "office payments expected"], hint: "Confirm once the buyer has paid", to: "/admin/sale-requests", tone: "sky", action: "Open" },
    { icon: Inbox, count: newInquiries.length, label: ["new inquiry", "new inquiries"], to: "/admin/inquiries?status=New", tone: "sky", action: "Reply" },
    { icon: MessageCircle, count: unreadMessages, label: ["unread message", "unread messages"], to: "/admin/messages", tone: "sky", action: "Reply" },
    { icon: Clock, count: expiring.length, label: ["agent plan expiring soon", "agent plans expiring soon"], hint: "Within the next 7 days", to: "/admin/subscriptions?status=expiring", tone: "gray", action: "View" },
  ];
  const needsAttention = attention.some((a) => a.count > 0);

  const latest = [...listings].sort((a, b) => new Date(b.listing.createdAt) - new Date(a.listing.createdAt)).slice(0, 4);
  const activity = buildActivity({ base: "/admin", listings, agents, offers, rentals, sales, inquiries: inquiries.filter((i) => i.ownerType === "admin"), findProperty, limit: 8 });
  const agentRows = [...agents].sort((a, b) => b.properties.length - a.properties.length || new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting()}, ${user.firstName}`}
        description={`Here's how ${siteName} is doing today.`}
        actions={
          <>
            {pendingListings.length > 0 && (
              <Link to="/admin/properties?status=pending" className="btn btn-light px-3.5 py-2">
                <FileClock className="h-4 w-4 text-amber-500" />
                Review {pendingListings.length} {pendingListings.length === 1 ? "listing" : "listings"}
              </Link>
            )}
            <Link to="/admin/properties/add" className="btn btn-primary px-3.5 py-2">
              <Plus className="h-4 w-4" />
              Add property
            </Link>
          </>
        }
      />

      {/* Portfolio at a glance: inventory, people, deals in progress */}
      <Band>
        <Zone title="Property inventory" action={<Link to="/admin/properties" className="text-xs font-semibold text-brand-600 hover:text-brand-800">Manage</Link>}>
          <p className="text-3xl font-semibold tracking-tight text-gray-900 tabular-nums">{listings.length}</p>
          <p className="mb-4 text-xs text-gray-500">
            {byState("published")} live · {byState("pending")} in review · {byState("draft")} drafts
          </p>
          <Breakdown
            total={listings.length}
            segments={[
              { label: "Available", value: byAvailability("Available"), className: "bg-emerald-500", to: "/admin/properties" },
              { label: "Under offer", value: byAvailability("Under Offer"), className: "bg-amber-400", to: "/admin/properties" },
              { label: "Rented", value: byAvailability("Rented"), className: "bg-sky-500", to: "/admin/properties" },
              { label: "Sold", value: byAvailability("Sold"), className: "bg-gray-400", to: "/admin/properties" },
            ]}
          />
        </Zone>

        <Zone title="People">
          <FigureRow label="Customers" value={customers.length} hint={newCustomers ? `${newCustomers} joined in the last 30 days` : "Registered customer accounts"} to="/admin/customers" />
          <FigureRow label="Agents" value={agents.length} hint={`${activeAgents.length} with an active subscription`} to="/admin/agents" />
          <FigureRow label="Plans expiring soon" value={expiring.length} hint="Within 7 days" to="/admin/subscriptions?status=expiring" attention={expiring.length > 0} />
        </Zone>

        <Zone title="Deals in progress">
          <FigureRow label="Pending offers" value={loading ? "–" : pending.offers} to="/admin/offers" attention={pending.offers > 0} />
          <FigureRow label="New inquiries" value={newInquiries.length} to="/admin/inquiries?status=New" attention={newInquiries.length > 0} />
          <FigureRow label="Rentals to confirm" value={loading ? "–" : pending.rentals} hint="Paid online, awaiting confirmation" to="/admin/rentals" attention={pending.rentals > 0} />
          <FigureRow label="Purchases in progress" value={loading ? "–" : sales.filter((s) => OPEN_SALE.includes(s.statusKey)).length} to="/admin/sale-requests" />
        </Zone>
      </Band>

      <div className="mt-6">
        <div>
          {loading ? (
            <Panel title="Needs your attention" bodyClassName="p-5"><div className="h-24 animate-pulse rounded-lg bg-gray-50" /></Panel>
          ) : error ? (
            <Panel title="Needs your attention"><ErrorState title="Couldn't load offers and requests" message={error} onRetry={reload} /></Panel>
          ) : needsAttention ? (
            <Panel title="Needs your attention" description={`Waiting on the ${siteName} team`} bodyClassName="">
              <AttentionList items={attention} />
            </Panel>
          ) : (
            <AllClear>Nothing needs your attention right now. New listings to review, offers and requests will show up here.</AllClear>
          )}
        </div>

      </div>

      {/* Latest listings as property previews */}
      <section className="mt-8">
        <SectionTitle title="Latest listings" description="The newest properties on the platform" to="/admin/properties" toLabel="All properties" />
        {latest.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
            <Building2 className="mx-auto h-6 w-6 text-gray-300" />
            <p className="mt-2 text-sm font-semibold text-gray-900">No properties yet</p>
            <p className="text-sm text-gray-500">Properties added to the platform will appear here.</p>
          </div>
        ) : (
          // Swipeable row on phones, a grid from tablet up
          <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
            {latest.map((p, i) => (
              <div key={p.id} className="w-[80%] shrink-0 snap-start sm:w-auto">
              <PropertyTile
                key={p.id}
                index={i}
                property={p}
                owner={ownerOf(p).name}
                status={getListingStatus(p, p.listing.state !== "published" || isPubliclyVisible(p))}
                onOpen={() => navigate(`/admin/properties?open=${p.id}`)}
              />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Panel title="Recent transactions" description="Rental payments, office sales and agent subscriptions" to="/admin/payments" toLabel="All payments" className="lg:col-span-2" bodyClassName="">
          {ledger.loading ? (
            <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-gray-50" />)}</div>
          ) : transactions.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Receipt className="mx-auto h-6 w-6 text-gray-300" />
              <p className="mt-2 text-sm font-semibold text-gray-900">No transactions yet</p>
              <p className="text-sm text-gray-500">Payments appear here once customers pay for rentals or agents subscribe.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {transactions.slice(0, 6).map((t) => (
                <li key={`${t.kind}-${t.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[8rem_1fr_auto_auto]">
                  <span className="order-3 sm:order-0"><StatusBadge status={KIND[t.kind].label} tone={KIND[t.kind].tone} dot={false} /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">{t.subject}</span>
                    <span className="block truncate text-xs text-gray-500">{t.party} · {formatRelative(t.date)}</span>
                  </span>
                  <span className="text-right text-sm font-semibold text-gray-900 tabular-nums">{formatCedis(t.amount)}</span>
                  <span className="order-4 justify-self-end sm:order-0"><StatusBadge status={t.status} /></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Money collected" to="/admin/payments" toLabel="Payments">
          {ledger.loading ? (
            <div className="h-28 animate-pulse rounded-lg bg-gray-50" />
          ) : ledger.error ? (
            <ErrorState title="Couldn't load payments" message={ledger.error} onRetry={ledger.reload} />
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">{formatCedis(totalCollected)}</p>
                <p className="text-xs text-gray-500">{formatCedis(last30)} in the last 30 days</p>
              </div>
              <div className="mt-4">
                <MiniBars data={monthly} format={formatCedis} label="Money collected per month" />
              </div>
              <dl className="mt-4 space-y-1.5 border-t border-gray-100 pt-3 text-sm">
                {[
                  ["Rentals (online)", sumOf("rental")],
                  ["Property sales (office)", sumOf("sale")],
                  ["Agent subscriptions", sumOf("subscription")],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-gray-600">{label}</dt>
                    <dd className="font-medium text-gray-900 tabular-nums">{formatCedis(value)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Platform activity" description="Listings, agents, offers, rentals, purchases and inquiries" className="lg:col-span-2" bodyClassName="">
        <ActivityFeed items={activity} loading={loading} emptyText={`Activity will appear here as agents and customers use ${siteName}.`} />
      </Panel>

        <Panel title="Agents" description="Plans, expiry and listings" to="/admin/agents" toLabel="Manage" bodyClassName="">
          {agentRows.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <UserCog className="mx-auto h-6 w-6 text-gray-300" />
              <p className="mt-2 text-sm font-semibold text-gray-900">No agents yet</p>
              <p className="text-sm text-gray-500">Agents appear here once they subscribe to a plan.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {agentRows.map((a) => (
                <li key={a.id}>
                  <Link to={`/admin/agents?open=${a.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50">
                    <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                      {getInitials(a.name)}
                      <span className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${a.status === "suspended" ? "bg-red-500" : SUB_TONE[a.sub.status]}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">{a.name}</span>
                      <span className="block truncate text-xs text-gray-500">
                        {a.status === "suspended"
                          ? "Account suspended"
                          : a.subscription
                            ? `${a.subscription.planName} · ${a.sub.isActive ? `until ${formatDate(a.subscription.expiryDate)}` : a.sub.statusLabel.toLowerCase()}`
                            : "No subscription"}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold text-gray-900 tabular-nums">{a.properties.length}</span>
                      <span className="block text-[11px] text-gray-400">{a.properties.length === 1 ? "listing" : "listings"}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
};

export default AdminDashboard;
