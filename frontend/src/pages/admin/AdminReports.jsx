import { useAdminData } from "../../hooks/useAdminData";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import { BarChart, ProportionBar } from "../../components/ui/Charts";
import { formatCedis, monthlySeries } from "../../utils/reports";

const ReportCard = ({ title, description, total, children, className = "" }) => (
  <section className={`rounded-2xl bg-white p-6 ring-1 ring-slate-200 ${className}`}>
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      {total != null && <p className="shrink-0 text-right text-xl font-extrabold text-gray-900 tabular-nums">{total}</p>}
    </div>
    {children}
  </section>
);

const sumValues = (series, key) => series.reduce((s, d) => s + (d.values[key] || 0), 0);

const AdminReports = () => {
  const { users, agents, listings, inquiries, payments } = useAdminData();
  const customers = users.filter((u) => u.role === "user");
  const paid = payments.filter((p) => p.status === "paid");
  const agentListings = listings.filter((p) => p.owner.type === "agent");
  const reviewed = agentListings.filter((p) => ["published", "rejected", "suspended"].includes(p.listing.state));

  const registrations = monthlySeries({ users: { items: customers, date: (u) => u.createdAt } });
  const agentRegs = monthlySeries({ agents: { items: agents, date: (a) => a.createdAt } });
  const listingSeries = monthlySeries({ listings: { items: listings, date: (p) => p.listing.createdAt } });
  const approvals = monthlySeries({
    submitted: { items: agentListings.filter((p) => p.listing.state !== "draft"), date: (p) => p.listing.createdAt },
    approved: { items: reviewed.filter((p) => p.listing.state !== "rejected"), date: (p) => p.listing.reviewedAt || p.listing.createdAt },
  });
  const revenue = monthlySeries({ revenue: { items: paid, date: (p) => p.createdAt, value: (p) => p.amount } });
  const subscriptions = monthlySeries({ subscriptions: { items: paid, date: (p) => p.createdAt } });
  const inquirySeries = monthlySeries({ inquiries: { items: inquiries, date: (i) => i.createdAt } });

  return (
    <>
      <AdminPageTitle title="Reports" description="Platform trends over the last 6 months. Figures come from the demo data." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ReportCard title="Subscription revenue" description="Paid agent subscriptions per month" total={formatCedis(sumValues(revenue, "revenue"))} className="lg:col-span-2">
          <BarChart title="Subscription revenue per month" data={revenue} series={[{ key: "revenue", label: "Revenue" }]} format={formatCedis} height={220} />
        </ReportCard>

        <ReportCard title="User registrations" description="New customer accounts" total={sumValues(registrations, "users")}>
          <BarChart title="User registrations per month" data={registrations} series={[{ key: "users", label: "Users" }]} />
        </ReportCard>

        <ReportCard title="Agent registrations" description="Accounts that became agents" total={sumValues(agentRegs, "agents")}>
          <BarChart title="Agent registrations per month" data={agentRegs} series={[{ key: "agents", label: "Agents" }]} />
        </ReportCard>

        <ReportCard title="Property listings" description="New listings created (admin and agents)" total={sumValues(listingSeries, "listings")}>
          <BarChart title="Property listings per month" data={listingSeries} series={[{ key: "listings", label: "Listings" }]} />
        </ReportCard>

        <ReportCard title="Property approvals" description="Agent submissions vs approvals">
          <BarChart title="Agent property submissions and approvals per month" data={approvals} series={[{ key: "submitted", label: "Submitted" }, { key: "approved", label: "Approved" }]} />
        </ReportCard>

        <ReportCard title="Subscription growth" description="New and renewed subscriptions per month" total={sumValues(subscriptions, "subscriptions")}>
          <BarChart title="Subscriptions per month" data={subscriptions} series={[{ key: "subscriptions", label: "Subscriptions" }]} />
        </ReportCard>

        <ReportCard title="Inquiries" description="Customer inquiries received" total={sumValues(inquirySeries, "inquiries")}>
          <BarChart title="Inquiries per month" data={inquirySeries} series={[{ key: "inquiries", label: "Inquiries" }]} />
        </ReportCard>

        <ReportCard title="Active vs expired subscriptions" description="Current state of all agent subscriptions" className="lg:col-span-2">
          <ProportionBar
            segments={[
              { label: "Active", value: agents.filter((a) => a.sub.isActive).length, className: "bg-emerald-500" },
              { label: "Expired", value: agents.filter((a) => a.sub.isExpired).length, className: "bg-red-500" },
              { label: "Cancelled", value: agents.filter((a) => a.sub.status === "cancelled").length, className: "bg-slate-400" },
              { label: "Pending", value: agents.filter((a) => a.sub.status === "pending").length, className: "bg-amber-400" },
            ]}
          />
        </ReportCard>
      </div>
    </>
  );
};

export default AdminReports;
