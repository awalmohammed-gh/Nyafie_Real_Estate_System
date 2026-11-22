import { useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Building, Building2, ChartColumn, Check, Crown, Eye, EyeOff, House, Image as ImageIcon, Layers, Pencil, Plus, Power, Search, Settings, Star, Trash2, TrendingDown, TrendingUp, UserRound, Users, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useAdminData } from "../../hooks/useAdminData";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import StatusBadge from "../../components/ui/StatusBadge";
import EmptyState from "../../components/ui/EmptyState";
import ActionMenu from "../../components/ui/ActionMenu";
import { ACCOUNT_TYPES, ANALYTICS_LEVELS, INQUIRY_LEVELS, durationLabel, isOrganization, planFeatureList } from "../../data/plans";
import "./adminReports.css";
import "./adminPlans.css";

const TYPE_ORDER = Object.keys(ACCOUNT_TYPES); // individual, agency, company
import { formatDate } from "../../utils/date";
import { adminPath } from "../../utils/adminEntry";

const emptyPlan = {
  name: "", tagline: "", accountType: "individual", internalChat: false, teamMemberLimit: 0, sortOrder: 0, price: "", durationDays: 30, propertyLimit: 5, imageLimit: 5, featuredLimit: 0,
  analytics: "basic", inquiryManagement: "basic", priorityVisibility: false, popular: false, active: true, extraFeatures: [],
};

const Toggle = ({ label, description, checked, onChange }) => (
  <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-slate-50 px-4 py-3">
    <span>
      <span className="block text-sm font-semibold text-gray-900">{label}</span>
      {description && <span className="block text-xs text-gray-500">{description}</span>}
    </span>
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-gray-300"}`}
    >
      <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  </label>
);

// A plan type's upgrade ladder, lowest tier first
const ladderOf = (plans, type) => plans.filter((p) => p.accountType === type).sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price);
const nextTier = (plans, type) => Math.max(0, ...ladderOf(plans, type).map((p) => p.sortOrder)) + 1;

const PlanForm = ({ plan, plans, onClose, onSave }) => {
  const [form, setForm] = useState(() => ({ ...emptyPlan, ...plan, sortOrder: plan ? plan.sortOrder : nextTier(plans, emptyPlan.accountType), price: String(plan?.price ?? ""), extra: (plan?.extraFeatures || []).join("\n") }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));
  // A new plan goes to the top of its type's ladder unless the admin picks a tier
  const setType = (type) => setForm((p) => ({ ...p, accountType: type, ...(plan ? {} : { sortOrder: nextTier(plans, type) }) }));
  const ladder = ladderOf(plans.filter((p) => p.id !== plan?.id), form.accountType);
  const sameTier = ladder.filter((p) => p.sortOrder === Math.round(Number(form.sortOrder) || 0));
  const num = (key, label, props = {}) => (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-gray-700">{label}</span>
      <input type="number" min="0" value={form[key]} onChange={(e) => set(key, e.target.value)} className="field" {...props} />
    </label>
  );

  const save = async () => {
    if (saving) return;
    const name = form.name.trim();
    if (!name) return setError("Give the plan a name.");
    if (plans.some((p) => p.id !== plan?.id && p.name.toLowerCase() === name.toLowerCase())) return setError("Another plan already uses this name.");
    if (!(Number(form.price) >= 0) || form.price === "") return setError("Enter a price (0 or more).");
    if (!(Number(form.durationDays) > 0)) return setError("Duration must be at least 1 day.");
    if (!(Number(form.propertyLimit) > 0) || !(Number(form.imageLimit) > 0)) return setError("Property and image limits must be at least 1.");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    setSaving(true);
    try { await onSave({
      id: plan?.id || (plans.some((p) => p.id === slug) ? `${slug}-${Date.now().toString(36)}` : slug),
      name,
      tagline: form.tagline.trim(),
      accountType: form.accountType,
      internalChat: form.internalChat,
      price: Number(form.price),
      durationDays: Number(form.durationDays),
      propertyLimit: Number(form.propertyLimit),
      imageLimit: Number(form.imageLimit),
      featuredLimit: Number(form.featuredLimit) || 0,
      teamMemberLimit: isOrganization(form.accountType) ? Math.max(0, Math.round(Number(form.teamMemberLimit) || 0)) : 0,
      sortOrder: Math.round(Number(form.sortOrder) || 0),
      analytics: form.analytics,
      inquiryManagement: form.inquiryManagement,
      priorityVisibility: form.priorityVisibility,
      popular: form.popular,
      active: form.active,
      extraFeatures: form.extra.split("\n").map((s) => s.trim()).filter(Boolean),
    }); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={saving ? () => {} : onClose} title={plan ? `Edit ${plan.name}` : "Create plan"} description="Changes to limits and features apply to existing subscribers immediately." size="lg"
      footer={<><button onClick={onClose} disabled={saving} className="btn btn-light">Cancel</button><button onClick={save} disabled={saving} aria-busy={saving} className="btn btn-primary">{saving ? "Saving…" : plan ? "Save plan" : "Create plan"}</button></>}
    >
      <fieldset disabled={saving} className="space-y-6"><legend className="sr-only">Plan details</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Plan name</span>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className="field" placeholder="e.g. Business" />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Tagline</span>
            <input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} className="field" placeholder="Who is this plan for?" />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Account type</span>
            <select value={form.accountType} onChange={(e) => setType(e.target.value)} className="field">
              {Object.entries(ACCOUNT_TYPES).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
            </select>
            <span className="mt-1 block text-xs text-gray-500">Providers only see and buy plans for their own account type.</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Upgrade tier</span>
            <input type="number" step="1" min="0" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} className="field" />
            <span className="mt-1 block text-xs text-gray-500">A higher tier is an upgrade within {ACCOUNT_TYPES[form.accountType].plural.toLowerCase()}.{ladder.length > 0 && <> Now: {ladder.map((p) => `${p.name} (${p.sortOrder})`).join(" → ")}</>}</span>
            {sameTier.length > 0 && <span className="mt-1 block text-xs text-amber-700">Same tier as {sameTier.map((p) => p.name).join(", ")}: neither is an upgrade from the other.</span>}
          </label>
          {num("price", "Price (GHS)", { step: "0.01" })}
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Duration</span>
            <select value={[30, 90, 180, 365].includes(Number(form.durationDays)) ? form.durationDays : "custom"} onChange={(e) => set("durationDays", e.target.value === "custom" ? 60 : Number(e.target.value))} className="field">
              <option value={30}>1 month (30 days)</option>
              <option value={90}>3 months (90 days)</option>
              <option value={180}>6 months (180 days)</option>
              <option value={365}>12 months (365 days)</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {![30, 90, 180, 365].includes(Number(form.durationDays)) && num("durationDays", "Custom duration (days)", { min: 1 })}
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-gray-900">Limits</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {num("propertyLimit", "Active properties", { min: 1 })}
            {num("imageLimit", "Images per property", { min: 1 })}
            {num("featuredLimit", "Featured listings")}
            {isOrganization(form.accountType) && num("teamMemberLimit", "Team members", { min: 0 })}
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-gray-900">Feature permissions</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">Analytics access</span>
              <select value={form.analytics} onChange={(e) => set("analytics", e.target.value)} className="field">
                {Object.entries(ANALYTICS_LEVELS).map(([id, l]) => <option key={id} value={id}>{l.label}: {l.description}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">Inquiry access</span>
              <select value={form.inquiryManagement} onChange={(e) => set("inquiryManagement", e.target.value)} className="field">
                {Object.entries(INQUIRY_LEVELS).map(([id, l]) => <option key={id} value={id}>{l.label}: {l.description}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Toggle label="Customer chat" description="Message customers on the platform (calls, email and WhatsApp work on every plan)" checked={form.internalChat} onChange={(v) => set("internalChat", v)} />
            <Toggle label="Priority visibility" description="Listed ahead of other agents" checked={form.priorityVisibility} onChange={(v) => set("priorityVisibility", v)} />
            <Toggle label="Most popular" description="Highlight on plans page" checked={form.popular} onChange={(v) => set("popular", v)} />
            <Toggle label="Active" description="Available to new agents" checked={form.active} onChange={(v) => set("active", v)} />
          </div>
        </div>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-gray-700">Other features <span className="text-gray-400">(one per line)</span></span>
          <textarea rows={3} value={form.extra} onChange={(e) => set("extra", e.target.value)} className="field resize-y" placeholder={"Agent profile page\nPriority support"} />
        </label>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      </fieldset>
    </Modal>
  );
};

// Each account type has its own icons, one per tier (the highest repeats for more tiers)
const TYPE_ICONS = { individual: UserRound, agency: UsersRound, company: Building2 };
const TIER_ICONS = { individual: [UserRound, UsersRound, Crown], agency: [Building, Building2, BriefcaseBusiness], company: [Building2, ChartColumn, Crown] };
const SHORT_TYPE = { individual: "Individual", agency: "Agency", company: "Company" };
const cedis = (value, decimals = 2) => `GH₵${Number(value || 0).toLocaleString("en-GH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
const monthKey = (date) => `${date.getFullYear()}-${date.getMonth()}`;

// Paid subscription payments: this month, the change from last month and the last 8 months for the bars
const revenueSummary = (payments) => {
  const totals = new Map();
  payments.filter((p) => p.status === "paid" && p.amount > 0).forEach((p) => {
    const key = monthKey(new Date(p.createdAt));
    totals.set(key, (totals.get(key) || 0) + p.amount);
  });
  const now = new Date();
  const months = Array.from({ length: 8 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 7 + i, 1);
    return { label: date.toLocaleDateString("en-GB", { month: "short" }), value: totals.get(monthKey(date)) || 0 };
  });
  const current = months[7].value;
  const previous = months[6].value;
  return { current, change: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null, months };
};

const SummaryCard = ({ icon: Icon, label, value, hint }) => (
  <div className="plans-stat">
    <span className="plans-stat-icon"><Icon size={20} aria-hidden="true" /></span>
    <p className="plans-stat-label">{label}</p>
    <p className="plans-stat-value">{value}</p>
    <p>{hint}</p>
  </div>
);

const PlanCard = ({ plan, tierIndex, working, onEdit, onView, onToggle, onDelete, activeCount }) => {
  const icons = TIER_ICONS[plan.accountType];
  const Icon = icons[Math.min(tierIndex, icons.length - 1)];
  const actions = [
    { label: `Subscribers (${activeCount} active)`, icon: Users, onClick: onView },
    { label: plan.active ? "Hide from new subscribers" : "Make available again", icon: Power, onClick: onToggle, disabled: working },
    { label: "Delete plan", icon: Trash2, onClick: onDelete, danger: true, disabled: working || activeCount > 0, disabledReason: "Hide this plan instead: active subscribers still use it." },
  ];
  return (
    <article className={`plan-card plan-card-${plan.accountType}${plan.active ? "" : " is-hidden"}`}>
      <div className="plan-card-top">
        <span className="plan-icon"><Icon size={27} strokeWidth={1.8} aria-hidden="true" /></span>
        <div className="plan-heading">
          <span className="plan-type-chip">{ACCOUNT_TYPES[plan.accountType].label}</span>
          <h3>{plan.name}{plan.popular && <span className="plan-popular">Popular</span>}</h3>
          <p>{plan.tagline || `A plan for ${ACCOUNT_TYPES[plan.accountType].plural.toLowerCase()}.`}</p>
        </div>
        <span className={`plan-status${plan.active ? " is-active" : ""}`}>{plan.active ? "Active" : "Hidden"}</span>
        <div className="plan-top-menu"><ActionMenu label={`Plan options for ${plan.name}`} actions={actions} /></div>
      </div>
      <p className="plan-price">
        <strong>{cedis(plan.price)}</strong>
        <span>/ {durationLabel(plan.durationDays)}</span>
        <span className="plan-tier">Tier {plan.sortOrder}</span>
      </p>
      <ul className="plan-limits" aria-label="Plan limits">
        {[[House, plan.propertyLimit, "Properties"], [ImageIcon, plan.imageLimit, "Images / listing"], [Star, plan.featuredLimit, "Featured"]].map(([LimitIcon, value, label]) => (
          <li key={label}>
            <LimitIcon size={18} aria-hidden="true" />
            <span><strong>{value}</strong>{label}</span>
          </li>
        ))}
      </ul>
      <footer className="plan-actions">
        <button type="button" className="is-primary" disabled={working} onClick={onEdit} aria-label={`Edit ${plan.name}`}><Pencil size={15} aria-hidden="true" />Edit Plan</button>
        <button type="button" onClick={onView} aria-label={`View ${plan.name} details`}><Eye size={15} aria-hidden="true" />View Details</button>
        <ActionMenu label={`More actions for ${plan.name}`} actions={actions} />
      </footer>
    </article>
  );
};

const AdminPlans = () => {
  const { plans, agents, payments, savePlan, togglePlanActive, deletePlan, plansError, refreshPlans } = useAdminData();
  const run = useAsyncAction();
  const [editing, setEditing] = useState(null); // plan | "new"
  const [deleting, setDeleting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("all");
  const [working, setWorking] = useState(false);

  const subscribers = (plan) => agents.filter((a) => a.subscription?.planId === plan.id);
  const activeSubscribers = (plan) => subscribers(plan).filter((a) => a.sub.isActive);
  const revenue = useMemo(() => revenueSummary(payments), [payments]);
  const peak = Math.max(...revenue.months.map((m) => m.value), 1);

  const term = search.trim().toLowerCase();
  const visible = plans.filter((plan) => (typeFilter === "all" || plan.accountType === typeFilter) && (availability === "all" || plan.active === (availability === "active")) && `${plan.name} ${plan.tagline}`.toLowerCase().includes(term));
  const groups = TYPE_ORDER.map((type) => ({ type, plans: ladderOf(visible, type) })).filter((group) => group.plans.length);
  const resetFilters = () => { setSearch(""); setTypeFilter("all"); setAvailability("all"); };
  const toggle = async (plan) => {
    setWorking(true);
    try { await run(togglePlanActive(plan.id), { success: plan.active ? "Plan hidden" : "Plan available again", description: plan.active ? "Hidden from new subscriptions. Existing subscribers keep access." : "Available to new subscribers and upgrades." }); }
    finally { setWorking(false); }
  };

  return (
    <div className="admin-reports admin-plans">
      <header className="plans-header">
        <div>
          <p className="reports-eyebrow">Subscriptions &amp; billing</p>
          <h1>Plans &amp; Pricing</h1>
          <p>Create and manage subscription plans, pricing and feature access for agents, agencies and companies.</p>
        </div>
        <div className="plans-header-actions">
          <Link to={`${adminPath("/settings")}?tab=agents`} className="reports-button is-secondary"><Settings size={17} aria-hidden="true" />Plan Settings</Link>
          <button type="button" disabled={Boolean(plansError)} onClick={() => setEditing("new")} className="reports-button is-primary"><Plus size={19} aria-hidden="true" />Create Plan</button>
        </div>
      </header>

      {plansError && <div className="plans-load-error" role="alert"><div><h2>Couldn't load the latest plans</h2><p>{plansError}{plans.length ? " Showing the last loaded plans." : " Please retry before making changes."}</p></div><button type="button" disabled={working} onClick={async () => { setWorking(true); try { await run(refreshPlans(), {}); } finally { setWorking(false); } }} className="reports-button is-secondary">Retry plans</button></div>}

      {(!plansError || plans.length > 0) && <>
        <div className="plans-overview">
          <div className="plans-stats">
            <SummaryCard icon={Layers} label="Total Plans" value={plans.length} hint={`${plans.filter((p) => p.active).length} open to new subscribers`} />
            <SummaryCard icon={UsersRound} label="Active Subscribers" value={agents.filter((a) => a.sub.isActive).length} hint={`Of ${agents.length} provider ${agents.length === 1 ? "account" : "accounts"}`} />
            <SummaryCard icon={Building2} label="Account Types" value={new Set(plans.map((p) => p.accountType)).size} hint="Individual, Agency, Company" />
            <SummaryCard icon={EyeOff} label="Hidden Plans" value={plans.filter((p) => !p.active).length} hint="Not visible to new subscribers" />
          </div>
          <section className="plans-revenue" aria-label="Subscription revenue">
            <div>
              <h2>Subscription Revenue</h2>
              <p className="plans-revenue-value">{cedis(revenue.current, 0)}</p>
              <p className="plans-revenue-note">
                This month
                {revenue.change !== null && <span className={revenue.change < 0 ? "is-down" : ""}>{revenue.change >= 0 ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}{revenue.change > 0 ? "+" : ""}{revenue.change}% vs last month</span>}
              </p>
            </div>
            <ol className="plans-revenue-bars" aria-label="Paid subscriptions, last 8 months">
              {revenue.months.map((month) => (
                <li key={month.label} title={`${month.label}: ${cedis(month.value, 0)}`}>
                  <span style={{ height: `${Math.max(6, (month.value / peak) * 100)}%` }} />
                  <span className="sr-only">{month.label}: {cedis(month.value, 0)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="plans-toolbar">
          <div className="plans-type-filter" role="group" aria-label="Plan account type">
            {[{ id: "all", label: "All Plans", short: "All Plans", icon: null }, ...TYPE_ORDER.map((type) => ({ id: type, label: ACCOUNT_TYPES[type].label, short: SHORT_TYPE[type], icon: TYPE_ICONS[type] }))].map((item) => (
              <button type="button" key={item.id} onClick={() => setTypeFilter(item.id)} aria-pressed={typeFilter === item.id} aria-label={`${item.label} (${plans.filter((p) => item.id === "all" || p.accountType === item.id).length})`}>
                {item.icon && <item.icon size={16} aria-hidden="true" />}
                <span className="plans-tab-label" aria-hidden="true">{item.label}</span>
                <span className="plans-tab-short" aria-hidden="true">{item.short}</span>
                <span className="plans-tab-count" aria-hidden="true">({plans.filter((p) => item.id === "all" || p.accountType === item.id).length})</span>
              </button>
            ))}
          </div>
          <div className="plans-filter-tools">
            <label className="plans-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search plans</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search plans by name..." /></label>
            <label className="plans-select"><span className="sr-only">Plan status</span><select value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="all">All status</option><option value="active">Active</option><option value="hidden">Hidden</option></select></label>
          </div>
        </div>

        {!plans.length ? (
          <EmptyState icon={Layers} title="Your first plan starts here" description="Set a price, choose the limits and give agents a clear way to get started." action={<button type="button" onClick={() => setEditing("new")} className="reports-button is-primary">Create your first plan</button>} />
        ) : !groups.length ? (
          <EmptyState icon={Search} title="No plans match these filters" description="Try another name, account type or status." action={<button type="button" onClick={resetFilters} className="reports-button is-secondary">Reset filters</button>} />
        ) : groups.map(({ type, plans: group }) => {
          const TypeIcon = TYPE_ICONS[type];
          return (
            <section key={type} className="plans-group" data-account-type={type} aria-labelledby={`plans-${type}`}>
              <div className="plans-group-heading">
                <h2 id={`plans-${type}`}><TypeIcon size={23} aria-hidden="true" />{type === "individual" ? "Individual Agent" : SHORT_TYPE[type]} Plans <span>({group.length})</span></h2>
                {typeFilter === "all" && <button type="button" onClick={() => setTypeFilter(type)}>Manage {type === "individual" ? "Individual" : SHORT_TYPE[type]} Plans<ArrowRight size={17} aria-hidden="true" /></button>}
              </div>
              <div className="plans-card-grid">
                {group.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    tierIndex={ladderOf(plans, type).findIndex((p) => p.id === plan.id)}
                    activeCount={activeSubscribers(plan).length}
                    working={working}
                    onEdit={() => setEditing(plan)}
                    onView={() => setViewing(plan)}
                    onToggle={() => toggle(plan)}
                    onDelete={() => setDeleting(plan)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <aside className="plans-guidance">
          <span><Layers size={20} aria-hidden="true" /></span>
          <div>
            <h2>Keep your subscription plans up to date.</h2>
            <p>Update pricing, limits and features. Limit changes apply to current subscribers immediately.</p>
          </div>
          <Link to={adminPath("/subscriptions")}>Manage Subscriptions<ArrowRight size={16} aria-hidden="true" /></Link>
        </aside>
      </>}

      {editing && (
        <PlanForm
          plan={editing === "new" ? null : editing}
          plans={plans}
          onClose={() => setEditing(null)}
          onSave={async (plan) => {
            const { ok } = await run(savePlan(plan), {
              success: editing === "new" ? "Plan created" : "Plan updated",
              description: `${plan.name} limits now apply to its agents.`,
            });
            if (ok) setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete plan?"
        description={deleting && `${deleting.name} will be removed. It has no active subscribers${subscribers(deleting).length ? `; ${subscribers(deleting).length} past subscriber(s) keep their billing history` : ""}.`}
        confirmLabel="Delete plan"
        onConfirm={async () => {
          const plan = deleting;
          setDeleting(null);
          await run(deletePlan(plan.id), { success: "Plan deleted", description: plan.name, type: "info" });
        }}
      />

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.name || ""} description={viewing ? `${ACCOUNT_TYPES[viewing.accountType].label} · Tier ${viewing.sortOrder} · ${viewing.active ? "Active" : "Hidden from new subscribers"}` : ""} size="lg"
        footer={viewing && <><button type="button" onClick={() => setViewing(null)} className="btn btn-light">Close</button><button type="button" onClick={() => { setEditing(viewing); setViewing(null); }} className="btn btn-primary">Edit plan</button></>}
      >
        {viewing && (
          <div className="plan-details">
            <p className="plan-details-price"><strong>{cedis(viewing.price)}</strong> / {durationLabel(viewing.durationDays)}</p>
            <h3>What's included</h3>
            <ul>{planFeatureList(viewing).map((feature) => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}</ul>
            <h3>Subscribers <span>{activeSubscribers(viewing).length} active · {subscribers(viewing).length} total</span></h3>
            {subscribers(viewing).length === 0 ? (
              <p className="plan-details-empty">No providers on this plan yet.</p>
            ) : (
              <ul className="plan-details-subscribers">
                {subscribers(viewing).map((a) => (
                  <li key={a.id}>
                    <span>
                      <strong>{a.name}</strong>
                      <small>{a.activeCount}/{viewing.propertyLimit} properties · expires {formatDate(a.subscription.expiryDate)}</small>
                    </span>
                    <StatusBadge status={a.sub.statusLabel} tone={{ active: "green", expiring: "amber", expired: "red", cancelled: "gray", pending: "amber" }[a.sub.status]} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminPlans;
