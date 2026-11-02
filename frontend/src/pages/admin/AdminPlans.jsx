import { useState } from "react";
import { Check, Layers, Pencil, Plus, Power, Search, Trash2, Users, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAdminData } from "../../hooks/useAdminData";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import StatusBadge from "../../components/ui/StatusBadge";
import EmptyState from "../../components/ui/EmptyState";
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

const AdminPlans = () => {
  const { plans, agents, savePlan, togglePlanActive, deletePlan, plansError, refreshPlans } = useAdminData();
  const run = useAsyncAction();
  const [editing, setEditing] = useState(null); // plan | "new"
  const [deleting, setDeleting] = useState(null);
  const [subscribersOf, setSubscribersOf] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("all");
  const [working, setWorking] = useState(false);

  const subscribers = (plan) => agents.filter((a) => a.subscription?.planId === plan.id);
  const activeSubscribers = (plan) => subscribers(plan).filter((a) => a.sub.isActive);

  const visible = plans.filter(plan => (typeFilter === "all" || plan.accountType === typeFilter) && (availability === "all" || plan.active === (availability === "active")) && (plan.name + " " + plan.tagline).toLowerCase().includes(search.trim().toLowerCase())).sort((a,b) => TYPE_ORDER.indexOf(a.accountType)-TYPE_ORDER.indexOf(b.accountType) || a.sortOrder-b.sortOrder || a.price-b.price);
  const resetFilters = () => { setSearch("");setTypeFilter("all");setAvailability("all"); };
  return (
    <div className="admin-reports admin-plans">
      <header className="reports-heading"><div><p className="reports-eyebrow">The right plan for every provider</p><h1>Plans &amp; pricing<span>.</span></h1><p>Manage pricing, access and upgrade paths in one place.</p></div><div className="reports-heading-actions"><Link to={adminPath("/inventory")} className="reports-button is-secondary">Financial inventory<ArrowUpRight size={15} aria-hidden="true" /></Link><button type="button" disabled={Boolean(plansError)} onClick={()=>setEditing("new")} className="reports-button is-primary"><Plus size={16} aria-hidden="true" />Create plan</button></div></header>
      {plansError && <div className="plans-load-error" role="alert"><div><h2>Couldn't load the latest plans</h2><p>{plansError}{plans.length ? " Showing the last loaded plans." : " Please retry before making changes."}</p></div><button type="button" disabled={working} onClick={async()=>{setWorking(true);try{await run(refreshPlans(),{});}finally{setWorking(false);}}} className="reports-button is-secondary">Retry plans</button></div>}
      {(!plansError || plans.length > 0) && <>
      <dl className="plans-summary">{[["Plans available",plans.filter(plan=>plan.active).length,"Open to new subscriptions"],["Active subscribers",agents.filter(agent=>agent.sub.isActive).length,"Across current agent accounts"],["Account types",new Set(plans.map(plan=>plan.accountType)).size,"Individuals, agencies and companies"],["Hidden plans",plans.filter(plan=>!plan.active).length,"Existing subscribers keep access"]].map(([label,value,hint])=><div key={label}><dt>{label}</dt><dd>{value}</dd><p>{hint}</p></div>)}</dl>
      <div className="plans-workspace">
        <div className="plans-toolbar"><div className="plans-type-filter" role="group" aria-label="Plan account type">{[{id:"all",label:"All plans"},...TYPE_ORDER.map(type=>({id:type,label:ACCOUNT_TYPES[type].label}))].map(item=><button type="button" key={item.id} onClick={()=>setTypeFilter(item.id)} aria-pressed={typeFilter===item.id}>{item.label}<span>{plans.filter(plan=>item.id==="all"||plan.accountType===item.id).length}</span></button>)}</div><div className="plans-filter-tools"><label className="plans-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search plans</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search plans..." /></label><label><span className="sr-only">Plan availability</span><select value={availability} onChange={event=>setAvailability(event.target.value)}><option value="all">All availability</option><option value="active">Active plans</option><option value="hidden">Hidden plans</option></select></label></div></div>
        <div className="plans-list-heading"><span>{visible.length} {visible.length===1?"plan":"plans"} shown</span><p>Lower tiers first within each account type</p></div>
        {!plans.length ? <EmptyState icon={Layers} title="Your first plan starts here" description="Set a price, choose the limits and give agents a clear way to get started." action={<button type="button" onClick={()=>setEditing("new")} className="reports-button is-primary">Create your first plan</button>} /> : !visible.length ? <EmptyState icon={Search} title="No plans match these filters" description="Try another name, account type or availability." action={<button type="button" onClick={resetFilters} className="reports-button is-secondary">Reset filters</button>} /> : <div className="plans-card-grid">{visible.map(plan=>{
          const activeCount=activeSubscribers(plan).length;
          return <article key={plan.id} className={"plan-card plan-type-"+plan.accountType+(plan.active?"":" is-hidden")}>
            <header><span className="plan-type-label"><Layers size={15} aria-hidden="true" />{ACCOUNT_TYPES[plan.accountType].label}</span><span className={"plan-availability "+(plan.active?"is-active":"")}>{plan.active?"Active":"Hidden"}</span></header>
            <div className="plan-title"><h2>{plan.name}</h2>{plan.popular&&<span className="plan-popular">Popular</span>}</div><p className="plan-tagline">{plan.tagline || "A plan for "+ACCOUNT_TYPES[plan.accountType].plural.toLowerCase()+"."}</p>
            <p className="plan-price"><strong>₵{plan.price.toLocaleString("en-GH",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span>{durationLabel(plan.durationDays)}</span><span className="plan-tier">Tier {plan.sortOrder}</span></p>
            <dl className="plan-limits">{[["Properties",plan.propertyLimit],["Images / listing",plan.imageLimit],["Featured",plan.featuredLimit]].map(([label,value])=><div key={label}><dd>{value}</dd><dt>{label}</dt></div>)}</dl>
            <ul className="plan-feature-list">{planFeatureList(plan).slice(3).map(feature=><li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}</ul>
            <button type="button" className="plan-subscribers" onClick={()=>setSubscribersOf(plan)} aria-label={"View "+plan.name+" subscribers"}><span><Users size={16} aria-hidden="true" />Subscribers</span><strong>{activeCount} active <span>/ {subscribers(plan).length} total</span></strong></button>
            <footer className="plan-actions"><button type="button" disabled={working} onClick={()=>setEditing(plan)} aria-label={"Edit "+plan.name}><Pencil size={15} aria-hidden="true" />Edit plan</button><button type="button" disabled={working} onClick={async()=>{setWorking(true);try{await run(togglePlanActive(plan.id),{success:plan.active?"Plan deactivated":"Plan activated",description:plan.active?"Hidden from new subscriptions. Existing subscribers keep access.":"Available to new subscribers and upgrades."});}finally{setWorking(false);}}} aria-label={(plan.active?"Deactivate ":"Activate ")+plan.name}><Power size={15} aria-hidden="true" />{plan.active?"Deactivate":"Activate"}</button><button type="button" disabled={working||activeCount>0} title={activeCount>0?"Deactivate this plan instead; active subscribers still use it.":"Delete plan"} aria-label={"Delete "+plan.name} onClick={()=>setDeleting(plan)}><Trash2 size={15} aria-hidden="true" /></button></footer>
            {activeCount>0&&<p className="plan-protection-note">Active subscribers keep this plan when it is hidden.</p>}
          </article>;
        })}</div>}
      </div>
      <aside className="plans-guidance"><span><Layers size={20} aria-hidden="true" /></span><div><h2>Keep upgrade paths simple.</h2><p>Agents can upgrade to a higher tier within their account type. Changes to limits apply immediately; deactivating a plan hides it from new subscriptions.</p></div><Link to={adminPath("/subscriptions")}>Manage subscriptions<ArrowUpRight size={15} aria-hidden="true" /></Link></aside>

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

      <Modal open={Boolean(subscribersOf)} onClose={() => setSubscribersOf(null)} title={`${subscribersOf?.name} subscribers`}>
        {subscribersOf && (subscribers(subscribersOf).length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">No agents on this plan yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {subscribers(subscribersOf).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-gray-900">{a.name}</span>
                  <span className="text-xs text-gray-500">{a.activeCount}/{subscribersOf.propertyLimit} properties · expires {formatDate(a.subscription.expiryDate)}</span>
                </span>
                <StatusBadge status={a.sub.statusLabel} tone={{ active: "green", expiring: "amber", expired: "red", cancelled: "gray", pending: "amber" }[a.sub.status]} />
              </li>
            ))}
          </ul>
        ))}
      </Modal>
    </div>
  );
};

export default AdminPlans;
