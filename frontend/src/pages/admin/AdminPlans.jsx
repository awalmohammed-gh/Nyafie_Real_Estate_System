import { useState } from "react";
import { motion } from "motion/react";
import { Check, Layers, Pencil, Plus, Power, Trash2, Users } from "lucide-react";
import { useAdminData } from "../../hooks/useAdminData";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import StatusBadge from "../../components/ui/StatusBadge";
import EmptyState from "../../components/ui/EmptyState";
import { ANALYTICS_LEVELS, INQUIRY_LEVELS, durationLabel, planFeatureList } from "../../data/plans";
import { formatDate } from "../../utils/date";

const emptyPlan = {
  name: "", tagline: "", price: "", durationDays: 30, propertyLimit: 5, imageLimit: 5, featuredLimit: 0,
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
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-gray-300"}`}
    >
      <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  </label>
);

const PlanForm = ({ plan, plans, onClose, onSave }) => {
  const [form, setForm] = useState(() => ({ ...emptyPlan, ...plan, price: String(plan?.price ?? ""), extra: (plan?.extraFeatures || []).join("\n") }));
  const [error, setError] = useState("");
  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));
  const num = (key, label, props = {}) => (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-gray-700">{label}</span>
      <input type="number" min="0" value={form[key]} onChange={(e) => set(key, e.target.value)} className="field" {...props} />
    </label>
  );

  const save = () => {
    const name = form.name.trim();
    if (!name) return setError("Give the plan a name.");
    if (plans.some((p) => p.id !== plan?.id && p.name.toLowerCase() === name.toLowerCase())) return setError("Another plan already uses this name.");
    if (!(Number(form.price) >= 0) || form.price === "") return setError("Enter a price (0 or more).");
    if (!(Number(form.durationDays) > 0)) return setError("Duration must be at least 1 day.");
    if (!(Number(form.propertyLimit) > 0) || !(Number(form.imageLimit) > 0)) return setError("Property and image limits must be at least 1.");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    onSave({
      id: plan?.id || (plans.some((p) => p.id === slug) ? `${slug}-${Date.now().toString(36)}` : slug),
      name,
      tagline: form.tagline.trim(),
      price: Number(form.price),
      durationDays: Number(form.durationDays),
      propertyLimit: Number(form.propertyLimit),
      imageLimit: Number(form.imageLimit),
      featuredLimit: Number(form.featuredLimit) || 0,
      analytics: form.analytics,
      inquiryManagement: form.inquiryManagement,
      priorityVisibility: form.priorityVisibility,
      popular: form.popular,
      active: form.active,
      extraFeatures: form.extra.split("\n").map((s) => s.trim()).filter(Boolean),
    });
  };

  return (
    <Modal open onClose={onClose} title={plan ? `Edit ${plan.name}` : "Create plan"} description="Limits apply to every agent on this plan immediately." size="lg"
      footer={<><button onClick={onClose} className="btn btn-light">Cancel</button><button onClick={save} className="btn btn-primary">{plan ? "Save plan" : "Create plan"}</button></>}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Plan name</span>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className="field" placeholder="e.g. Business" />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Tagline</span>
            <input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} className="field" placeholder="Who is this plan for?" />
          </label>
          {num("price", "Price (GHS)")}
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
            <Toggle label="Priority visibility" description="Listed ahead of other agents" checked={form.priorityVisibility} onChange={(v) => set("priorityVisibility", v)} />
            <Toggle label="Most popular" description="Highlight on plans page" checked={form.popular} onChange={(v) => set("popular", v)} />
            <Toggle label="Active" description="Available to new agents" checked={form.active} onChange={(v) => set("active", v)} />
          </div>
        </div>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-gray-700">Other features <span className="text-gray-400">(one per line)</span></span>
          <textarea rows={3} value={form.extra} onChange={(e) => set("extra", e.target.value)} className="field resize-y" placeholder={"Agent profile page\nPriority support"} />
        </label>
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
};

const AdminPlans = () => {
  const { plans, agents, savePlan, togglePlanActive, deletePlan } = useAdminData();
  const run = useAsyncAction();
  const [editing, setEditing] = useState(null); // plan | "new"
  const [deleting, setDeleting] = useState(null);
  const [subscribersOf, setSubscribersOf] = useState(null);

  const subscribers = (plan) => agents.filter((a) => a.subscription?.planId === plan.id);
  const activeSubscribers = (plan) => subscribers(plan).filter((a) => a.sub.isActive);

  return (
    <>
      <AdminPageTitle
        title="Plans"
        description="The single source of truth for agent limits and features."
        action={<button onClick={() => setEditing("new")} className="btn btn-primary"><Plus className="h-4 w-4" />Create plan</button>}
      />

      {plans.length === 0 ? (
        <EmptyState icon={Layers} title="No plans yet" description="Create a plan so agents can subscribe." />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {plans.map((plan, index) => {
            const activeCount = activeSubscribers(plan).length;
            return (
              <motion.article
                key={plan.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex flex-col rounded-lg bg-white p-6 ring-1 ring-slate-200 ${plan.active ? "" : "opacity-75"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
                      <StatusBadge status={plan.active ? "Active" : "Inactive"} tone={plan.active ? "green" : "gray"} />
                      {plan.popular && <StatusBadge status="Popular" tone="brand" dot={false} />}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{plan.tagline}</p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="block text-2xl font-semibold text-gray-900">₵{plan.price.toLocaleString()}</span>
                    <span className="text-xs text-gray-500">{durationLabel(plan.durationDays)}</span>
                  </p>
                </div>

                <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                  {[["Properties", plan.propertyLimit], ["Images", plan.imageLimit], ["Featured", plan.featuredLimit]].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 py-3">
                      <dd className="text-lg font-bold text-gray-900 tabular-nums">{value}</dd>
                      <dt className="text-xs text-gray-500">{label}</dt>
                    </div>
                  ))}
                </dl>

                <ul className="mt-5 mb-5 space-y-2">
                  {planFeatureList(plan).slice(3).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button onClick={() => setSubscribersOf(plan)} className="mt-auto flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm transition hover:bg-slate-100">
                  <span className="flex items-center gap-2 text-gray-700"><Users className="h-4 w-4 text-gray-400" />Subscribed agents</span>
                  <span className="font-semibold text-gray-900">{activeCount} active · {subscribers(plan).length} total</span>
                </button>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <button onClick={() => setEditing(plan)} className="btn btn-light flex-1 px-4"><Pencil className="h-4 w-4" />Edit</button>
                  <button
                    onClick={() =>
                      run(togglePlanActive(plan.id), {
                        success: plan.active ? "Plan deactivated" : "Plan activated",
                        description: plan.active ? `${plan.name} is hidden from new agents. Existing subscribers keep it.` : `${plan.name} is available to new agents.`,
                      })
                    }
                    className="btn btn-light flex-1 px-4"
                  >
                    <Power className="h-4 w-4" />
                    {plan.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => setDeleting(plan)}
                    disabled={activeCount > 0}
                    title={activeCount > 0 ? "Plans with active subscribers can't be deleted" : undefined}
                    aria-label={`Delete ${plan.name}`}
                    className="btn btn-light px-3 text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

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
    </>
  );
};

export default AdminPlans;
