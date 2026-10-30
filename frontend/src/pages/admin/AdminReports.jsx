import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, Building2, CalendarDays, Check, ChevronRight, Download, FileText, Inbox, Loader2, RefreshCw, Table2, Users, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { usePlatform } from "../../context/usePlatform";
import { useToast } from "../../context/useToast";
import { useApiQuery } from "../../hooks/useApiQuery";
import { adminApi } from "../../frontApi";
import { BarChart } from "../../components/ui/Charts";
import { buildAdminReport, sumReportValues } from "../../utils/adminReport";
import "./adminReports.css";

const loadReport = async () => ({ ...await adminApi.getReportSnapshot(), generatedAt: new Date().toISOString() });
const count = value => value.toLocaleString("en-GH");
const money = new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-GH", { notation: "compact", maximumFractionDigits: 1 });
const formatCedis = value => `₵${money.format(value)}`;
const METRICS = [
  { key: "revenue", label: "Subscription revenue", icon: Wallet, tone: "purple" },
  { key: "users", label: "New customers", icon: Users, tone: "blue" },
  { key: "listings", label: "New listings", icon: Building2, tone: "teal" },
  { key: "inquiries", label: "Customer inquiries", icon: Inbox, tone: "amber" },
];

const MonthlyTable = ({ report, section }) => {
  const sections = section ? [section] : report.sections.filter(item => item.totalKey);
  const columns = sections.flatMap(item => item.series.map(series => ({ ...series, section: item })));
  return <div className="reports-table-scroll" tabIndex={0} role="region" aria-label={`${section ? section.title : "Monthly breakdown"} table, scroll horizontally for more columns`}>
    <table className="reports-table">
      <caption className="sr-only">{section ? section.title : "Monthly performance breakdown"}, {report.months[0].fullLabel} to {report.months.at(-1).fullLabel}</caption>
      <thead><tr><th scope="col">Month</th>{columns.map(column => <th key={column.key} scope="col">{section ? column.label : column.section.key === "users" ? "Customers" : column.section.title}</th>)}</tr></thead>
      <tbody>{report.months.map((month, index) => <tr key={month.fullLabel}><th scope="row">{month.fullLabel}{index === report.months.length - 1 && <span className="reports-to-date">To date</span>}</th>{columns.map(column => <td key={column.key}>{column.section.currency ? formatCedis(column.section.data[index].values[column.key] || 0) : count(column.section.data[index].values[column.key] || 0)}</td>)}</tr>)}</tbody>
      <tfoot><tr><th scope="row">Period total</th>{columns.map(column => <td key={column.key}>{column.section.currency ? formatCedis(sumReportValues(column.section.data, column.key)) : count(sumReportValues(column.section.data, column.key))}</td>)}</tr></tfoot>
    </table>
  </div>;
};

const SubscriptionHealth = ({ report }) => {
  const total = report.statuses.reduce((sum, item) => sum + item.value, 0) + report.agentsWithoutSubscription;
  const rows = [...report.statuses, { label: "No plan", value: report.agentsWithoutSubscription, color: "#d7d5e2" }];
  const active = report.statuses.find(item => item.label === "Active").value;
  let cursor = 0;
  const gradient = rows.map(row => { const start = cursor; cursor += total ? row.value / total * 100 : 0; return `${row.color} ${start}% ${cursor}%`; }).join(", ");
  return <section className="reports-panel reports-health" aria-labelledby="subscription-health-heading">
    <header className="reports-panel-heading"><div><p className="reports-eyebrow">Right now</p><h2 id="subscription-health-heading">Subscription health</h2><p>Current agents, across all periods</p></div></header>
    <div className="reports-donut" role="img" aria-label={rows.map(row => `${row.label}: ${row.value}`).join(", ")} style={{ background: total ? `conic-gradient(${gradient})` : "#eeedf3" }}><div><strong>{total ? Math.round(active / total * 100) : 0}%</strong><span>of agents active</span></div></div>
    <dl className="reports-health-legend">{rows.map(row => <div key={row.label}><dt><span style={{backgroundColor:row.color}} />{row.label}</dt><dd>{count(row.value)}<span>{total ? Math.round(row.value / total * 100) : 0}%</span></dd></div>)}</dl>
    <Link to="/admin/subscriptions" className="reports-panel-link">Manage subscriptions<ChevronRight size={15} aria-hidden="true" /></Link>
  </section>;
};

const AdminReports = () => {
  const { siteName } = usePlatform();
  const { toast } = useToast();
  const query = useApiQuery("admin-report-snapshot", loadReport);
  const snapshot = query.data ?? query.previous;
  const report = useMemo(() => snapshot ? buildAdminReport(snapshot, new Date(snapshot.generatedAt)) : null, [snapshot]);
  const [metric, setMetric] = useState("revenue");
  const [view, setView] = useState("chart");
  const [exporting, setExporting] = useState(false);
  const section = report?.sections.find(item => item.key === metric);
  const approvals = report?.sections.find(item => item.key === "approvals");
  const empty = report && report.sections.every(item => item.data.every(row => Object.values(row.values).every(value => value === 0)));
  const downloadReport = async () => {
    if (exporting || !report) return;
    setExporting(true);
    try {
      const { downloadAdminReport } = await import("../../utils/reportPdf");
      await downloadAdminReport(report, siteName);
      toast({ title: "Report downloaded", description: "The six-month report shown here has been saved as a PDF." });
    } catch (error) {
      toast({ title: "Couldn't download report", description: error.message || "Please try again.", type: "error" });
    } finally { setExporting(false); }
  };

  return <div className="admin-reports">
    <header className="reports-heading"><div><p className="reports-eyebrow">Insights &amp; performance</p><h1>Reports<span>.</span></h1><p>A clearer view of how {siteName} is growing.</p></div><div className="reports-heading-actions">
      <button type="button" className="reports-button is-secondary" onClick={query.reload} disabled={query.loading || exporting}><RefreshCw size={15} className={query.loading ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />{query.loading ? "Refreshing" : "Refresh"}</button>
      <button type="button" onClick={downloadReport} disabled={!report || query.loading || exporting} aria-busy={exporting} className="reports-button is-primary">{exporting ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}{exporting ? "Preparing PDF…" : "Export PDF"}</button>
    </div></header>
    <div className="reports-period-bar"><span><CalendarDays size={15} aria-hidden="true" />{report ? `${report.months[0].fullLabel} – ${report.months.at(-1).fullLabel}` : "Last 6 calendar months"}<span className="reports-period-note">Current month to date</span></span><span role="status">{query.loading ? "Loading report data…" : report ? `Updated ${report.generatedAt.toLocaleTimeString("en-GB", {hour:"2-digit",minute:"2-digit"})}` : "Report unavailable"}</span></div>
    {query.error ? <div className="reports-error" role="alert"><FileText size={23} aria-hidden="true" /><h2>Couldn't load your report</h2><p>{query.error}</p><button type="button" className="reports-button is-secondary" onClick={query.reload}>Try again</button></div> : !report ? <div className="reports-loading" role="status"><Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /><p>Gathering account, property and subscription data…</p></div> : <>
      {empty && <p className="reports-empty-notice"><BarChart3 size={18} aria-hidden="true" />No activity recorded in this period yet. Your reports will fill in as the platform grows.</p>}
      <ul className="reports-summary" aria-label="Six-month report totals">{METRICS.map(({key,label,icon:Icon,tone}) => {
        const item = report.sections.find(item => item.key === key);
        const latest = item.data.at(-1).values[item.totalKey] || 0;
        const previous = item.data.at(-2).values[item.totalKey] || 0;
        const change = previous ? Math.round((latest - previous) / previous * 100) : null;
        const ChangeIcon = change < 0 ? ArrowDownRight : ArrowUpRight;
        return <li key={key}><button type="button" onClick={() => setMetric(key)} className={`reports-stat tone-${tone}`} aria-pressed={metric === key}><span className="reports-stat-top"><span className="reports-stat-icon"><Icon size={19} aria-hidden="true" /></span><ArrowUpRight size={16} aria-hidden="true" /></span><span className="reports-stat-label">{label}</span><strong>{item.currency ? formatCedis(item.total) : count(item.total)}</strong><span className="reports-stat-foot">{change !== null && change !== 0 ? <span className={change < 0 ? "is-down" : "is-up"}><ChangeIcon size={13} aria-hidden="true" />{Math.abs(change)}%<span className="sr-only">{change < 0 ? " decrease" : " increase"}</span></span> : <span className="reports-stat-neutral">{change === 0 ? "No change" : "No prior activity"}</span>}<span>this month vs last*</span></span></button></li>;
      })}</ul>
      <p className="reports-comparison-note">*Current month to date compared with the whole previous month.</p>
      <div className="reports-main-grid">
        <section className="reports-panel reports-trend" aria-labelledby="report-trend-heading"><header className="reports-panel-heading"><div><h2 id="report-trend-heading">Performance over time</h2><p>Explore one metric at a time</p></div><div className="reports-view-switch" role="group" aria-label="Trend display"><button type="button" onClick={() => setView("chart")} aria-pressed={view === "chart"}><BarChart3 size={15} aria-hidden="true" />Chart</button><button type="button" onClick={() => setView("table")} aria-pressed={view === "table"}><Table2 size={15} aria-hidden="true" />Table</button></div></header>
          <div className="reports-trend-controls"><label htmlFor="report-metric">Metric</label><select id="report-metric" value={metric} onChange={event => setMetric(event.target.value)}>{report.sections.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</select></div>
          <div className="reports-trend-summary"><span>{section.title} · 6-month total</span><strong>{section.total !== null ? section.currency ? formatCedis(section.total) : count(section.total) : count(sumReportValues(section.data,"approved")) + " approved"}</strong><p>{section.description}</p></div>
          {view === "table" ? <MonthlyTable report={report} section={section} /> : <div className="reports-chart"><BarChart key={metric} title={`${section.title} per month`} data={section.data} series={section.series} format={section.currency ? formatCedis : undefined} axisFormat={section.currency ? value => `₵${compact.format(value)}` : undefined} integer={!section.currency} height={220} /></div>}
          <p className="reports-chart-note">{section.currency ? "Ghana cedis (GHS). Paid agent subscriptions only; rental and sale payments are excluded." : "Calendar-month totals. The current month is still in progress."}</p>
        </section>
        <SubscriptionHealth report={report} />
      </div>
      <div className="reports-lower-grid"><section className="reports-panel"><header className="reports-panel-heading"><div><h2>Listing review activity</h2><p>Agent submissions and approvals by month</p></div><span className="reports-small-icon"><Building2 size={18} aria-hidden="true" /></span></header><div className="reports-chart"><BarChart title="Listing submissions and approvals" data={approvals.data} series={approvals.series} integer height={180} /></div><p className="reports-chart-note">Approvals use the review date, or creation date when no review date is available.</p></section>
        <aside className="reports-export-card"><span className="reports-export-icon"><FileText size={24} aria-hidden="true" /></span><h2>Your report, ready to share.</h2><p>Download the same figures you see here, with monthly totals, trends and subscription status in one PDF.</p><ul><li><Check size={15} aria-hidden="true" />All seven report metrics</li><li><Check size={15} aria-hidden="true" />Six months of activity</li><li><Check size={15} aria-hidden="true" />No customer contact details</li></ul><button type="button" onClick={downloadReport} disabled={exporting || query.loading} className="reports-button is-secondary"><Download size={15} aria-hidden="true" />{exporting ? "Preparing PDF…" : "Download report"}</button></aside></div>
      <section className="reports-panel"><header className="reports-panel-heading"><div><h2>Monthly breakdown</h2><p>All your period totals in one place</p></div><span className="reports-table-hint">Scroll table to see every metric</span></header><MonthlyTable report={report} /></section>
      <p className="reports-footnote">Report figures reflect the records loaded at {report.generatedAt.toLocaleTimeString("en-GB", {hour:"2-digit",minute:"2-digit"})}. Refresh to include new activity. Subscription status is a current snapshot.</p>
    </>}
  </div>;
};

export default AdminReports;
