import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Building2, CalendarDays, CheckCheck, ChevronDown, ChevronRight, Eye, Minus, Plus, RefreshCw } from "lucide-react";
import { adminPath } from "../../utils/adminEntry";
import { cloudImage } from "../../utils/cloudImage";

const plural = (count, one, many) => count === 1 ? one : many;
const formatCedis = value => `GH₵${Number(value || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const OverviewHeader = ({ name, siteName, generatedAt, loading, onRefresh, months, onMonthsChange }) => {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <header className="overview-heading">
      <div>
        <p className="overview-eyebrow">Your workspace</p>
        <h1>{greeting}{name ? `, ${name}` : ""}<span className="overview-greeting-dot">.</span></h1>
        <p className="overview-subtitle">Here’s what’s happening across {siteName}.</p>
      </div>
      <div className="overview-heading-actions">
        <label className="overview-period-select"><span className="sr-only">Performance period</span><CalendarDays size={17} aria-hidden="true" /><select value={months} onChange={event => onMonthsChange(Number(event.target.value))}>{[3, 6, 12].map(value => <option key={value} value={value}>Last {value} months</option>)}</select><ChevronDown size={16} aria-hidden="true" /></label>
        <Link to={adminPath("/properties/add")} className="overview-button overview-button-primary"><Plus size={17} aria-hidden="true" />Add property</Link>
      </div>
      <div className="overview-dateline">
        <span>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" })}</span>
        <button type="button" onClick={onRefresh} disabled={loading} className="overview-refresh" title={generatedAt ? `Last updated ${new Date(generatedAt).toLocaleTimeString("en-GB", { timeZone: "Africa/Accra", hour: "2-digit", minute: "2-digit" })}. Refreshes every minute.` : "Refresh overview"} aria-label="Refresh overview"><RefreshCw size={14} aria-hidden="true" className={loading ? "animate-spin motion-reduce:animate-none" : ""} /><span className="sr-only" role="status">{loading ? "Updating overview" : "Refresh overview"}</span></button>
      </div>
    </header>
  );
};

export const MetricGrid = ({ items }) => (
  <ul className="overview-metrics" aria-label="Platform summary">
    {items.map(({ label, value, hint, icon: Icon, to, toLabel, attention, change, tone = "violet" }) => {
      const ChangeIcon = change === 0 ? Minus : change < 0 ? ArrowDownRight : ArrowUpRight;
      return (
        <li key={label} className={`overview-stat overview-stat-${tone}`}>
          <Link to={to} className="overview-stat-link">
            <span className="overview-icon"><Icon size={24} strokeWidth={1.7} aria-hidden="true" /></span>
            <div className="overview-stat-main">
            <p className="overview-stat-label">{label}</p>
            <div className="overview-stat-value"><strong>{value}</strong></div>
            </div>
            <p className={`overview-stat-hint ${attention ? "has-attention" : ""}`} title={hint}>{Number.isFinite(change) ? <><span className={`overview-change ${change === 0 ? "is-flat" : change < 0 ? "is-down" : "is-up"}`}><ChangeIcon size={12} aria-hidden="true" />{Math.abs(change)}%</span><span>vs previous 30 days</span></> : <>{attention && <span className="overview-attention-dot" aria-hidden="true" />}{hint}</>}</p>
            <span className="sr-only">{toLabel}</span>
          </Link>
        </li>
      );
    })}
  </ul>
);

export const SectionHeading = ({ title, description, to, toLabel = "View all", children }) => (
  <header className="overview-section-heading">
    <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
    {children}
    {to && <Link to={to} className="overview-text-link">{toLabel}<ArrowUpRight size={15} aria-hidden="true" /></Link>}
  </header>
);

export const AttentionQueue = ({ items, total, summary = [] }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="overview-panel overview-attention" aria-labelledby="attention-heading">
      <header className="overview-section-heading"><h2 id="attention-heading">Needs attention <span className={`overview-count ${total === 0 ? "is-clear" : ""}`}>{total}</span></h2></header>
      <ul className="overview-attention-summary">{summary.map(({ icon: Icon, label, count, to }) => <li key={label}><Link to={to}><Icon size={20} aria-hidden="true" /><span>{label}</span><strong>{count.toLocaleString()}</strong><ChevronRight size={15} aria-hidden="true" /></Link></li>)}</ul>
      {items.length ? <>
        <button type="button" className="overview-queue-toggle" aria-expanded={expanded} aria-controls="overview-action-queue" onClick={() => setExpanded(!expanded)}>{expanded ? "Hide task details" : `Review all ${items.length} task categories`}<ChevronDown size={15} className={expanded ? "rotate-180" : ""} aria-hidden="true" /></button>
        {expanded && <>
        <ul className="overview-queue" id="overview-action-queue">
          {items.map(({ icon: Icon, count, label, hint, to, tone, action }) => (
            <li key={to + label[0]}><Link to={to} className="overview-queue-link">
              <span className={`overview-task-icon tone-${tone}`}><Icon size={17} aria-hidden="true" /></span>
              <span className="overview-task-copy"><strong>{count.toLocaleString()} {plural(count, label[0], label[1])}</strong><span>{hint}</span></span>
              <span className="overview-task-action">{action}<ChevronRight size={14} aria-hidden="true" /></span>
            </Link></li>
          ))}
        </ul>
        </>}
      </> : <div className="overview-all-clear"><CheckCheck size={17} aria-hidden="true" /><p>You're all caught up.</p></div>}
    </section>
  );
};

export const CounterList = ({ items }) => (
  <ul className="overview-deal-list">
    {items.map(({ label, value, to, icon: Icon }) => <li key={label}><Link to={to}>
      <span className="overview-deal-icon"><Icon size={17} aria-hidden="true" /></span><span>{label}</span><strong>{value.toLocaleString()}</strong><ChevronRight size={15} aria-hidden="true" />
    </Link></li>)}
  </ul>
);

export const InventorySummary = ({ properties }) => {
  // Publication states are mutually exclusive; deal availability is a separate count.
  const states = [
    { label: "Live", value: Math.max(0, properties.published - properties.hidden), color: "#7950c7" },
    { label: "In review", value: properties.inReview, color: "#e7b24e" },
    { label: "Drafts", value: properties.drafts, color: "#b7c3d3" },
    { label: "Other / hidden", value: properties.hidden + (properties.rejected || 0) + (properties.suspended || 0), color: "#e5e7ee" },
  ];
  return <section className="overview-panel">
    <SectionHeading title="Property portfolio" to={adminPath("/properties")} toLabel="Manage" />
    <div className="overview-inventory-body">
      <div className="overview-inventory-total"><strong>{properties.total.toLocaleString()}</strong><span>total {plural(properties.total, "property", "properties")}</span><span className="overview-neutral-pill">+{properties.addedThisMonth} this month</span></div>
      <div className="overview-stacked-bar" role="img" aria-label={states.map(s => `${s.label}: ${s.value}`).join(", ")}>{states.map(s => s.value > 0 && <span key={s.label} style={{ width: `${properties.total > 0 ? s.value / properties.total * 100 : 0}%`, backgroundColor: s.color }} />)}</div>
      <dl className="overview-inventory-legend">{states.map(s => <div key={s.label}><dt><span style={{ backgroundColor: s.color }} />{s.label}</dt><dd>{s.value.toLocaleString()}</dd></div>)}</dl>
    </div>
    <Link to={adminPath("/properties")} className="overview-panel-footer">{properties.available.toLocaleString()} available · {properties.rented.toLocaleString()} rented · {properties.sold.toLocaleString()} sold<ArrowRight size={15} aria-hidden="true" /></Link>
  </section>;
};

export const RevenueSources = ({ revenue }) => {
  const rows = [
    { label: "Rental payments", value: revenue.breakdown.rental, color: "#7950c7" },
    { label: "Sales", value: revenue.breakdown.sale, color: "#42a6a0" },
    { label: "Agent subscriptions", value: revenue.breakdown.subscription, color: "#e7b24e" },
  ];
  return <section className="overview-panel">
    <SectionHeading title="Revenue sources" to={adminPath("/payments")} toLabel="Payments" />
    <div className="overview-revenue-body"><p className="overview-revenue-total">{formatCedis(revenue.total)}</p><dl className="overview-revenue-list">{rows.map(({ label, value, color }) => <div key={label}><div className="overview-revenue-row"><dt><span style={{ backgroundColor: color }} />{label}</dt><dd>{formatCedis(value)}</dd></div><div className="overview-source-track" aria-hidden="true"><span style={{ width: `${revenue.total > 0 ? value / revenue.total * 100 : 0}%`, backgroundColor: color }} /></div></div>)}</dl></div>
  </section>;
};

export const PopularListings = ({ properties, siteName }) => (
  <section className="overview-panel overview-popular">
    <SectionHeading title="Most viewed properties" description="The listings getting the most attention" to={adminPath("/properties")} toLabel="All properties" />
    <div className="overview-popular-labels" aria-hidden="true"><span>#</span><span>Property</span><span>Listing owner</span><span>Views</span></div>
    {properties.mostViewed?.length ? <ol className="overview-property-list">{properties.mostViewed.map((property, index) => <li key={property.id}><Link to={adminPath(`/properties?open=${encodeURIComponent(property.id)}`)}>
      <span className="overview-property-rank">{String(index + 1).padStart(2, "0")}</span>
      {property.image ? <img src={cloudImage(property.image, 64)} alt="" loading="lazy" className="overview-property-image" /> : <span className="overview-property-image overview-property-placeholder"><Building2 size={21} aria-hidden="true" /></span>}
      <span className="overview-property-name"><strong>{property.title}</strong><span>{property.area || "Location not provided"}</span></span>
      <span className={`overview-owner ${property.ownerType === "admin" ? "is-team" : ""}`}>{property.ownerType === "admin" ? siteName : "Agent"}</span>
      <span className="overview-property-views"><Eye size={15} aria-hidden="true" />{property.views.toLocaleString()}<span className="sr-only"> views</span></span><ArrowUpRight size={16} className="overview-property-arrow" aria-hidden="true" />
    </Link></li>)}</ol> : <div className="overview-empty-properties"><Eye size={25} aria-hidden="true" /><h3>Your next popular listing starts here</h3><p>Once customers view your properties, the most popular ones will appear here.</p><Link to={adminPath("/properties")} className="overview-text-link">Manage properties<ArrowRight size={15} aria-hidden="true" /></Link></div>}
    <footer className="overview-views-footer"><Eye size={15} aria-hidden="true" /><strong>{(properties.views || 0).toLocaleString()}</strong> views across all properties</footer>
  </section>
);
