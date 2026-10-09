import { useState } from "react";
import { AlertTriangle, Archive, Ban, CheckCircle2, Loader2, ShieldCheck, Trash2, UserX } from "lucide-react";
import Modal from "../ui/Modal";
import PageLoader from "../ui/PageLoader";
import { useAuth } from "../../context/useAuth";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { useApiQuery } from "../../hooks/useApiQuery";
import { adminApi } from "../../frontApi";
import { formatDate } from "../../utils/date";

const REMOVAL_REASONS = { fraud: "Fraud", policy: "Policy violation", duplicate: "Duplicate account", closed: "Business closed", other: "Other" };
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const dangerButton = "btn bg-red-600 text-white hover:bg-red-700 disabled:opacity-60";

const Loading = ({ label }) => <PageLoader size="sm" label={label} />;
const Failed = ({ error }) => <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;

// The normal action: deactivate the provider and take them off the marketplace, keeping every record
const RemoveProvider = ({ agent, onClose }) => {
  const { admin } = useAuth();
  const run = useAsyncAction();
  const impact = useApiQuery(`removal:${agent.id}`, () => adminApi.getRemovalImpact(agent.id));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const data = impact.data;

  const submit = async () => {
    setBusy(true);
    const { ok } = await run(admin.removeAgent(agent.id, reason, note), { success: "Provider removed successfully", description: data?.name || agent.name, type: "warning" });
    setBusy(false);
    if (ok) onClose();
  };

  const effects = !data ? [] : data.kind === "staff"
    ? [
      `End their access to ${data.organisation || "their organisation"} and sign them out`,
      `Give their ${plural(data.assignedWork, "assigned listing or lead", "assigned listings and leads")} back to the owner`,
      "Leave the organisation, its listings and its plan as they are",
    ]
    : [
      "Disable the account and sign them out everywhere",
      `Unpublish ${plural(data.listings, "live or in-review listing")}`,
      ...(data.kind === "organisation" ? [`Disable ${plural(data.staff, "team membership")} (their own accounts stay)`, `Revoke ${plural(data.invites, "pending invitation")}`] : []),
      data.subscription ? `Stop the ${data.subscription.planName} subscription` : "No active subscription to stop",
      `Close ${plural(data.conversations, "open conversation")}`,
    ];

  return (
    <Modal open onClose={onClose} title={`Remove ${data?.name || agent.name}?`} size="md"
      footer={<><button type="button" onClick={onClose} className="btn btn-light">Cancel</button><button type="button" onClick={submit} disabled={!data || !reason || busy} className={dangerButton}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" />Removing...</> : <><UserX className="h-4 w-4" />Remove provider</>}</button></>}>
      {impact.loading ? <Loading label="Checking what this affects..." /> : impact.error ? <Failed error={impact.error} /> : (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-gray-900">This will:</p>
            <ul className="mt-2 space-y-1.5">
              {effects.map((effect) => <li key={effect} className="flex items-start gap-2 text-sm text-gray-700"><Ban className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />{effect}</li>)}
            </ul>
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Historical data is preserved: payments, subscriptions, inquiries, offers, bookings, listing records and team history. You can restore the account later.</p>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="field">
              <option value="">Choose a reason</option>
              {Object.entries(REMOVAL_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Internal note <span className="font-normal text-gray-400">(optional, never shown to the provider)</span></span>
            <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className="field resize-y" />
          </label>
        </div>
      )}
    </Modal>
  );
};

// Controlled restore: the account comes back; listings only if asked; team and plan are separate
const RestoreProvider = ({ agent, onClose }) => {
  const { admin } = useAuth();
  const run = useAsyncAction();
  const impact = useApiQuery(`restore:${agent.id}`, () => adminApi.getRemovalImpact(agent.id));
  const [republish, setRepublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const hidden = impact.data?.hiddenByRemoval || 0;

  const submit = async () => {
    setBusy(true);
    const { ok } = await run(admin.restoreAgent(agent.id, republish), { success: "Provider restored", description: agent.name });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Restore ${agent.name}?`} size="md"
      footer={<><button type="button" onClick={onClose} className="btn btn-light">Cancel</button><button type="button" onClick={submit} disabled={busy || impact.loading} className="btn btn-primary">{busy ? <><Loader2 className="h-4 w-4 animate-spin" />Restoring...</> : <><CheckCircle2 className="h-4 w-4" />Restore provider</>}</button></>}>
      {impact.loading ? <Loading label="Loading..." /> : impact.error ? <Failed error={impact.error} /> : (
        <div className="space-y-4 text-sm text-gray-600">
          <p>Their account becomes usable again and they can sign in. Anything else comes back only as you choose:</p>
          {hidden > 0 && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4">
              <input type="checkbox" checked={republish} onChange={(e) => setRepublish(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
              <span><span className="block font-semibold text-gray-900">Also bring back {plural(hidden, "listing")} hidden by the removal</span>Each returns to where it was: published, or waiting for review.</span>
            </label>
          )}
          <ul className="list-disc space-y-1 pl-5">
            <li>The subscription isn't reactivated. Manage it from Change plan or Extend.</li>
            <li>Former team members aren't added back. The owner can invite them again.</li>
          </ul>
        </div>
      )}
    </Modal>
  );
};

const ACTION_STYLE = {
  delete: { label: "Delete", className: "bg-red-50 text-red-700 ring-red-100", icon: Trash2 },
  anonymize: { label: "Anonymize", className: "bg-amber-50 text-amber-800 ring-amber-100", icon: UserX },
  preserve: { label: "Keep", className: "bg-emerald-50 text-emerald-800 ring-emerald-100", icon: Archive },
};

// The separate high-risk action: shows exactly what happens to each kind of record, then a typed confirmation
const DeleteProvider = ({ agent, onClose }) => {
  const { admin } = useAuth();
  const run = useAsyncAction();
  const plan = useApiQuery(`deletion:${agent.id}`, () => adminApi.getDeletionPlan(agent.id));
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const data = plan.data;
  const matches = data && typed.trim().replace(/\s+/g, " ").toUpperCase() === data.confirmText;

  const submit = async () => {
    setBusy(true);
    const { ok } = await run(admin.deleteAgentPermanently(agent.id, typed), { success: data.mode === "erase" ? "Provider permanently deleted" : "Personal details permanently deleted", description: data.name, type: "warning" });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Permanently delete ${data?.name || agent.name}?`} description="This can't be undone." size="lg"
      footer={<><button type="button" onClick={onClose} className="btn btn-light">Cancel</button><button type="button" onClick={submit} disabled={!matches || busy} className={dangerButton}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" />Deleting...</> : <><Trash2 className="h-4 w-4" />Delete permanently</>}</button></>}>
      {plan.loading ? <Loading label="Checking every related record..." /> : plan.error ? <Failed error={plan.error} /> : (
        <div className="space-y-5">
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {data.mode === "erase" ? "Nothing else on HomeBase depends on this provider, so the account and the records below marked Delete are removed completely." : "Other records depend on this provider (payments, customers or team history), so their personal details are erased and the account is kept as “Deleted agent”. Records marked Keep are never deleted."}
          </p>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {data.rows.map((row) => {
              const style = ACTION_STYLE[row.action];
              return (
                <li key={row.key} className={`flex items-start gap-3 px-4 py-3 ${row.count === 0 ? "opacity-50" : ""}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">{row.label} <span className="font-normal text-gray-500 tabular-nums">({row.count})</span></span>
                    <span className="block text-xs text-gray-500">{row.detail}</span>
                  </span>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${style.className}`}><style.icon className="h-3.5 w-3.5" aria-hidden="true" />{style.label}</span>
                </li>
              );
            })}
          </ul>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Type <span className="font-mono font-semibold text-red-700">{data.confirmText}</span> to confirm</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className="field font-mono" />
          </label>
        </div>
      )}
    </Modal>
  );
};

// action: { type: "remove" | "restore" | "delete", agent }
const ProviderRemovalDialogs = ({ action, onClose }) => {
  if (!action) return null;
  const Dialog = { remove: RemoveProvider, restore: RestoreProvider, delete: DeleteProvider }[action.type];
  return Dialog ? <Dialog key={`${action.type}:${action.agent.id}`} agent={action.agent} onClose={onClose} /> : null;
};

// Admin-only summary of a removal, for the provider's detail panel
export const RemovalSummary = ({ removal }) => removal && (
  <div className="rounded-lg border border-red-100 bg-red-50/60 p-4 text-sm">
    <p className="font-semibold text-red-800">{removal.deletedAt ? `Personal details deleted ${formatDate(removal.deletedAt)}` : `Removed ${formatDate(removal.removedAt)}`}</p>
    <p className="mt-1 text-red-900/80">Reason: {REMOVAL_REASONS[removal.reason] || removal.reason}{removal.note ? ` · ${removal.note}` : ""}</p>
  </div>
);

export default ProviderRemovalDialogs;
