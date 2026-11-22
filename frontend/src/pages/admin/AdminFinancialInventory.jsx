import { useId, useState } from "react";
import { ArrowUpRight, BarChart3, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Coins, Copy, Download, Eye, FileText, Hourglass, Loader2, RefreshCw, Search, Table2, TriangleAlert, Undo2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { adminApi } from "../../frontApi";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useToast } from "../../context/useToast";
import ActionMenu from "../../components/ui/ActionMenu";
import AdminRecordModal from "../../components/admin/AdminRecordModal";
import { adminPath } from "../../utils/adminEntry";
import "./adminReports.css";
import "./adminInventory.css";

const SECTORS = {
  rental: { label: "Rentals", short: "Rentals", color: "#7718a1" },
  hotel: { label: "Hotels & short stays", short: "Short stays", color: "#c487e5" },
  sale: { label: "Property sales", short: "Sales", color: "#dedbe9" },
  subscription: { label: "Agent subscriptions", short: "Subscriptions", color: "#d8b6ec" },
};
const STATES = { paid: "Paid", pending: "Pending", failed: "Failed", review: "Refund review", refunded: "Refunded" };
const TOTALS = [
  { key: "paid", label: "Recorded receipts", icon: Coins },
  { key: "pending", label: "Pending attempts", icon: Hourglass },
  { key: "review", label: "Refund review", icon: RefreshCw },
  { key: "refunded", label: "Refunded", icon: Undo2 },
  { key: "failed", label: "Failed attempts", icon: TriangleAlert },
];
const money = value => `GH₵${Number(value || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iso = date => date.toISOString().slice(0, 10);
const displayDate = value => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" });
const period = preset => {
  const now = new Date(), start = new Date(now);
  if (preset === "year") start.setUTCMonth(0, 1);
  else start.setUTCDate(start.getUTCDate() - (preset === "90" ? 89 : 29));
  return { from: preset === "all" ? "" : iso(start), to: iso(now) };
};
const sourcePath = row => adminPath(row.source === "subscription" ? "/subscriptions" : "/payments");

const SectorChart = ({ sectors }) => {
  const gradientId = useId().replaceAll(":", "");
  const total = sectors.reduce((sum, item) => sum + item.paid, 0);
  const maximum = Math.max(...sectors.map(item => item.paid), 1);
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 4));
  const step = [1, 2, 2.5, 5, 10].find(value => value * magnitude >= maximum / 4) * magnitude;
  const ceiling = Math.ceil(maximum / step) * step;
  const ticks = Array.from({ length: Math.round(ceiling / step) + 1 }, (_, index) => index * step);
  return <svg className="inventory-bar-chart" viewBox="0 0 520 262" role="group" aria-label="Recorded receipts by sector. Hover or focus a bar for details.">
    <defs><linearGradient id={gradientId} x1="0" x2="1" y1="1" y2="0"><stop stopColor="#651581" /><stop offset="1" stopColor="#8d20bc" /></linearGradient></defs>
    {ticks.map(value => { const y = 224 - value / ceiling * 192; return <g key={value}><line x1="57" x2="510" y1={y} y2={y} stroke="#ece8f4" /><text x="32" y={y + 4} textAnchor="end" className="inventory-chart-axis">{value >= 1000 ? `${Number((value / 1000).toFixed(1))}K` : Number(value.toFixed(2))}</text></g>; })}
    {sectors.map((item, index) => { const x = 69 + index * 113, height = item.paid / ceiling * 192; return <g key={item.key}><rect x={x} y={224 - height} width="88" height={item.paid ? Math.max(height, 2) : 0} rx="3" fill={item.key === "rental" ? `url(#${gradientId})` : SECTORS[item.key].color} /><text x={x + 44} y={Math.max(17, 212 - height)} textAnchor="middle" className="inventory-chart-value">{money(item.paid)}</text><text x={x + 44} y="247" textAnchor="middle" className="inventory-chart-axis">{SECTORS[item.key].short}</text></g>; })}
    {sectors.map((item, index) => {
      const x = 69 + index * 113, height = item.paid / ceiling * 192;
      const share = (total ? item.paid / total * 100 : 0).toFixed(1);
      return <g key={item.key} className="inventory-chart-hover" tabIndex={0} role="img" aria-label={`${SECTORS[item.key].short}: ${money(item.paid)}, ${share}% of receipts`}>
        <rect className="inventory-chart-hit" x={x - 6} y="8" width="100" height="247" fill="transparent" />
        <g className="inventory-bar-tooltip" transform={`translate(${Math.min(326, Math.max(5, x - 40))}, ${Math.max(4, 224 - height - 88)})`} aria-hidden="true">
          <rect width="188" height="78" rx="9" fill="#271038" />
          <text x="13" y="21" className="inventory-tooltip-title">{SECTORS[item.key].short}</text>
          <text x="13" y="43" className="inventory-tooltip-amount">{money(item.paid)}</text>
          <text x="13" y="63" className="inventory-tooltip-share">{share}% of recorded receipts</text>
        </g>
      </g>;
    })}
  </svg>;
};

const SectorBreakdown = ({ sectors, total, onSelect, selected }) => {
  const [hovered, setHovered] = useState(null);
  const items = ["rental", "hotel", "subscription", "sale"].map(key => sectors.find(item => item.key === key)).filter(Boolean);
  let offset = 0;
  const circumference = 2 * Math.PI * 43;
  const segments = items.map(item => { const start = offset; const length = total ? item.paid / total * circumference : 0; offset += length; return { ...item, start, length }; });
  const active = items.find(item => item.key === hovered);
  return <div className="inventory-breakdown"><h3>Sector breakdown</h3><div className="inventory-breakdown-content">
    <div className="inventory-donut" role="group" aria-label={`Total recorded receipts: ${money(total)}. Hover or focus a sector for details.`}>
      <svg className="inventory-donut-segments" viewBox="0 0 100 100"><circle cx="50" cy="50" r="43" fill="none" stroke="#eee9f4" strokeWidth="14" />{segments.filter(item => item.length > 0).map(item => <circle key={item.key} cx="50" cy="50" r="43" fill="none" stroke={SECTORS[item.key].color} strokeWidth={hovered === item.key ? 17 : 14} strokeDasharray={`${item.length} ${circumference - item.length}`} strokeDashoffset={-item.start} transform="rotate(-90 50 50)" tabIndex={0} role="img" aria-label={`${SECTORS[item.key].short}: ${money(item.paid)}, ${(item.paid / total * 100).toFixed(1)}% of receipts`} onPointerEnter={() => setHovered(item.key)} onPointerLeave={() => setHovered(null)} onFocus={() => setHovered(item.key)} onBlur={() => setHovered(null)} />)}</svg>
      <div><strong>{money(active ? active.paid : total)}</strong><span>{active ? SECTORS[active.key].short : "Total"}</span></div>
      {active && <p className="inventory-donut-tooltip" role="tooltip"><strong>{SECTORS[active.key].short}</strong><span>{money(active.paid)} · {(total ? active.paid / total * 100 : 0).toFixed(1)}%</span></p>}
    </div>
    <div className="inventory-legend">{items.map(item => <button type="button" key={item.key} onClick={() => onSelect(item.key)} onPointerEnter={() => setHovered(item.key)} onPointerLeave={() => setHovered(null)} onFocus={() => setHovered(item.key)} onBlur={() => setHovered(null)} aria-pressed={selected === item.key} title={`Show ${SECTORS[item.key].short.toLowerCase()} in the ledger`}><span className="inventory-legend-label"><i style={{ background: SECTORS[item.key].color }} />{SECTORS[item.key].short}</span><strong>{money(item.paid)}</strong><span>{(total ? item.paid / total * 100 : 0).toFixed(1)}%</span></button>)}</div>
  </div></div>;
};

const AdminFinancialInventory = () => {
  const [preset, setPreset] = useState("30");
  const [filters, setFilters] = useState(() => ({ ...period("30"), sector: "all", status: "all", search: "", page: 1 }));
  const [dates, setDates] = useState(() => period("30"));
  const [search, setSearch] = useState("");
  const [dateError, setDateError] = useState("");
  const [view, setView] = useState("chart");
  const [viewing, setViewing] = useState(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const query = useApiQuery(`financial-inventory:${JSON.stringify(filters)}`, () => adminApi.getFinancialInventory(filters));
  const data = query.data ?? query.previous;
  const update = changes => setFilters(current => ({ ...current, ...changes, page: 1 }));
  const copyReference = async row => {
    try { await navigator.clipboard.writeText(row.reference); toast({ title: "Payment reference copied" }); }
    catch { toast({ type: "error", title: "Could not copy the reference", description: "Open the record to select and copy it." }); }
  };
  const exportSummary = () => {
    if (!data || query.loading) return;
    const rows = [["Sector", "Recorded paid (GHS)", "Pending attempts (GHS)", "Failed attempts (GHS)", "Refund review (GHS)", "Refunded (GHS)"], ...data.sectors.map(item => [SECTORS[item.key].label, ...["paid", "pending", "failed", "review", "refunded"].map(key => item[key].toFixed(2))]), ["Total", ...["paid", "pending", "failed", "review", "refunded"].map(key => data.totals[key].toFixed(2))]];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `nyafie-sector-summary-${filters.from || "all"}-to-${filters.to || iso(new Date())}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="admin-reports admin-inventory">
    <header className="reports-heading"><div><p className="reports-eyebrow">Finance</p><h1>Financial Inventory</h1><p>Track recorded money across properties, stays and agent plans.</p></div><div className="reports-heading-actions"><button type="button" onClick={query.reload} disabled={query.loading} className="reports-button is-secondary"><RefreshCw size={17} className={query.loading ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />Refresh</button><button type="button" onClick={exportSummary} disabled={!data || query.loading} className="reports-button is-primary"><Download size={17} aria-hidden="true" />Export Summary</button></div></header>
    <div className="inventory-period"><div><label htmlFor="inventory-period">Reporting period</label><div className="inventory-period-select"><CalendarDays size={18} aria-hidden="true" /><select id="inventory-period" value={preset} onChange={event => { const value = event.target.value; setPreset(value); setDateError(""); if (value !== "custom") { const next = period(value); setDates(next); update(next); } }}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="year">This year</option><option value="all">All time</option><option value="custom">Custom dates</option></select><ChevronDown size={17} aria-hidden="true" /></div></div><p role="status">{query.loading ? "Updating financial records…" : data ? <>{filters.from ? displayDate(`${filters.from}T00:00:00Z`) : "First record"} – {displayDate(`${filters.to || iso(new Date())}T00:00:00Z`)}<span>·</span>Ghana time</> : "Records unavailable"}</p></div>
    {preset === "custom" && <form className="inventory-dates" onSubmit={event => { event.preventDefault(); if (dates.from && dates.to && dates.from > dates.to) { setDateError("The start date must be before the end date."); return; } setDateError(""); update(dates); }}><label>From<input type="date" value={dates.from} onChange={event => setDates({ ...dates, from: event.target.value })} /></label><label>To<input type="date" value={dates.to} onChange={event => setDates({ ...dates, to: event.target.value })} /></label><button className="reports-button is-primary" type="submit">Apply dates</button>{dateError && <p role="alert">{dateError}</p>}</form>}
    {query.error ? <div className="reports-error" role="alert"><FileText aria-hidden="true" /><h2>Couldn't load financial inventory</h2><p>{query.error}</p><button type="button" className="reports-button is-secondary" onClick={query.reload}>Try again</button></div> : !data ? <div className="reports-loading" role="status"><Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /><p>Combining payment and subscription records…</p></div> : <div className={`inventory-content ${query.loading ? "is-updating" : ""}`} aria-busy={query.loading}>
      {data.providerEnvironment === "test" && <div className="inventory-test-note" role="note"><TriangleAlert size={21} aria-hidden="true" /><p><strong>Paystack is in test mode.</strong> Recorded payments may be test transactions; verify live settlement before using them for accounting.</p></div>}
      <div className="inventory-totals">{TOTALS.map(({ key, label, icon: Icon }) => <div key={key} className={`inventory-total total-${key}`}><Icon size={25} strokeWidth={1.8} aria-hidden="true" /><div><p>{label}</p><strong>{money(data.totals[key])}</strong><span>{data.totals[`${key}Count`]} {key === "paid" ? "recorded paid transactions" : "records"}</span></div></div>)}</div>
      <section className="reports-panel inventory-revenue" aria-labelledby="sector-heading"><header className="reports-panel-heading"><div><h2 id="sector-heading">Revenue by sector</h2><p>Recorded receipts for the selected period.</p></div><div className="inventory-view-switch" role="group" aria-label="Sector display"><button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}><BarChart3 size={17} aria-hidden="true" />Chart</button><button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}><Table2 size={16} aria-hidden="true" />Table</button></div></header>
        {view === "chart" ? <div className="inventory-chart-layout"><SectorChart sectors={data.sectors} /><SectorBreakdown sectors={data.sectors} total={data.totals.paid} selected={filters.sector} onSelect={sector => update({ sector })} /></div> : <><p className="inventory-scroll-hint">Scroll horizontally to see every amount. Pending and failed amounts are attempts, not collected income.</p><div className="reports-table-scroll" role="region" tabIndex={0} aria-label="Sector accounting table"><table className="reports-table inventory-accounting"><thead><tr><th scope="col">Sector</th><th scope="col">Recorded paid</th><th scope="col">Pending</th><th scope="col">Failed</th><th scope="col">Refund review</th><th scope="col">Refunded</th></tr></thead><tbody>{data.sectors.map(item => <tr key={item.key}><th scope="row"><button type="button" onClick={() => update({ sector: item.key })}>{SECTORS[item.key].label}</button></th>{["paid", "pending", "failed", "review", "refunded"].map(key => <td key={key}>{money(item[key])}</td>)}</tr>)}</tbody><tfoot><tr><th scope="row">All sectors</th>{["paid", "pending", "failed", "review", "refunded"].map(key => <td key={key}>{money(data.totals[key])}</td>)}</tr></tfoot></table></div></>}
      </section>
      <section className="reports-panel inventory-ledger-panel"><header className="reports-panel-heading"><div><h2>Transaction ledger</h2><p>Individual records from both payment ledgers.</p></div><span className="inventory-result-count">{data.total.toLocaleString()} records</span></header><div className="inventory-ledger-filters"><label>Ledger sector<div className="inventory-select"><select value={filters.sector} onChange={event => update({ sector: event.target.value })}><option value="all">All sectors</option>{Object.entries(SECTORS).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></div></label><label>Status<div className="inventory-select"><select value={filters.status} onChange={event => update({ status: event.target.value })}><option value="all">All statuses</option>{Object.entries(STATES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></div></label><form onSubmit={event => { event.preventDefault(); update({ search: search.trim() }); }}><label htmlFor="inventory-search" className="sr-only">Search by reference, account or amount</label><div className="inventory-search"><button type="submit" aria-label="Search financial records"><Search size={18} aria-hidden="true" /></button><input id="inventory-search" placeholder="Search by reference, account or amount..." maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></div></form>{(filters.sector !== "all" || filters.status !== "all" || filters.search || search) && <button type="button" className="inventory-reset" onClick={() => { setSearch(""); update({ sector: "all", status: "all", search: "" }); }}>Reset ledger filters</button>}</div>
        <p className="inventory-scroll-hint">Scroll horizontally to see all transaction details and actions.</p>{data.rows.length ? <div className="reports-table-scroll" tabIndex={0} role="region" aria-label="Financial transaction ledger, scroll for more columns"><table className="reports-table inventory-ledger"><thead><tr>{["Payment / reference", "Sector", "Account", "Date", "Amount", "Status", "Actions"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={`${row.source}:${row.id}`}><th scope="row"><Link to={sourcePath(row)}>{row.subject}</Link><div className="inventory-reference"><span>{row.reference} · {row.method}</span><button type="button" onClick={() => copyReference(row)} aria-label={`Copy reference ${row.reference}`}><Copy size={14} aria-hidden="true" /></button></div></th><td><span className="inventory-sector-label">{SECTORS[row.sector].label}</span></td><td>{row.name}</td><td>{displayDate(row.at)}</td><td className="inventory-amount">{money(row.amount)}</td><td><span className={`inventory-status status-${row.status}`}><i aria-hidden="true" />{STATES[row.status]}</span></td><td><div className="inventory-row-actions"><button type="button" className="inventory-view-record" onClick={() => setViewing(row)} aria-label={`View ${row.subject}, reference ${row.reference}`}>View</button><ActionMenu label={`Actions for ${row.reference}`} actions={[{ label: "View record", icon: Eye, onClick: () => setViewing(row) }, { label: "Copy reference", icon: Copy, onClick: () => copyReference(row) }, { label: row.source === "subscription" ? "Open subscriptions" : "Open payments", icon: ArrowUpRight, onClick: () => navigate(sourcePath(row)) }]} /></div></td></tr>)}</tbody></table></div> : <div className="inventory-no-results"><Search size={26} aria-hidden="true" /><h3>No matching transactions</h3><p>Try another period, sector, status, account, amount or payment reference.</p></div>}
        <footer className="inventory-pagination"><span>{data.total ? `Showing ${(data.page - 1) * data.limit + 1} – ${Math.min(data.page * data.limit, data.total)} of ${data.total}` : "0 records"}</span><div><button type="button" aria-label="Previous transactions page" disabled={query.loading || filters.page <= 1} onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}><ChevronLeft size={17} aria-hidden="true" />Previous</button><button type="button" aria-label="Next transactions page" disabled={query.loading || filters.page * data.limit >= data.total} onClick={() => setFilters(current => ({ ...current, page: current.page + 1 }))}>Next<ChevronRight size={17} aria-hidden="true" /></button></div></footer>
      </section>
      <p className="reports-footnote">Gross recorded receipts include admin and agent-owned transactions. They are not platform profit or verified bank settlement. Expenses, provider fees, commissions and payouts are not tracked here. Waived subscriptions, plan credits, zero-value records and explicitly marked test payments are excluded. Refund-review amounts have not been refunded yet; refunded amounts went back to customers and are not receipts.</p>
    </div>}
    <AdminRecordModal open={Boolean(viewing)} onClose={() => setViewing(null)} title="Transaction details" description="Recorded financial inventory entry" footer={viewing && <Link to={sourcePath(viewing)} className="btn btn-primary">{viewing.source === "subscription" ? "Open subscriptions" : "Open payments"}<ArrowUpRight size={16} /></Link>}>
      {viewing && <dl className="inventory-record-details">{[["Payment / property", viewing.subject], ["Reference", viewing.reference], ["Sector", SECTORS[viewing.sector].label], ["Account", viewing.name], ["Date (Ghana time)", displayDate(viewing.at)], ["Amount", money(viewing.amount)], ["Status", STATES[viewing.status]], ["Payment method", viewing.method], ["Ownership", viewing.source === "subscription" ? "Agent subscription" : viewing.ownerType === "agent" ? "Agent-owned listing" : "Platform / admin"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>}
    </AdminRecordModal>
  </div>;
};
export default AdminFinancialInventory;
