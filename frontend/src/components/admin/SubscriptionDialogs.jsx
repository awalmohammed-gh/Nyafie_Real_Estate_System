import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import Modal from "../ui/Modal";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useAuth } from "../../context/useAuth";
import { usePlatform } from "../../context/usePlatform";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { durationLabel } from "../../data/plans";
import { addDays, formatDate } from "../../utils/date";

const ChangePlan = ({ agent, onClose }) => {
  const { admin } = useAuth();
  const { plans } = usePlatform();
  const run = useAsyncAction();
  const [planId, setPlanId] = useState(agent.subscription?.planId || plans[0]?.id);
  const selected = plans.find((p) => p.id === planId);
  const overLimit = selected && agent.activeCount > selected.propertyLimit;

  const save = async () => {
    const { ok } = await run(admin.changePlan(agent.id, planId), {
      success: "Plan changed",
      description: `${agent.name} is now on ${selected.name}. New limits apply immediately.`,
    });
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Change subscription plan"
      description={`${agent.name} · current plan: ${agent.subscription?.planName || "none"}`}
      footer={
        <>
          <button onClick={onClose} className="btn btn-light">Cancel</button>
          <button onClick={save} disabled={planId === agent.subscription?.planId} className="btn btn-primary">Change plan</button>
        </>
      }
    >
      <div role="radiogroup" className="space-y-3">
        {plans.map((plan) => (
          <button
            key={plan.id}
            role="radio"
            aria-checked={planId === plan.id}
            onClick={() => setPlanId(plan.id)}
            className={`flex w-full items-start justify-between gap-4 rounded-lg p-4 text-left ring-1 transition ${planId === plan.id ? "bg-brand-50 ring-2 ring-brand-500" : "ring-gray-200 hover:ring-gray-300"}`}
          >
            <span>
              <span className="flex items-center gap-2 font-semibold text-gray-900">
                {plan.name}
                {!plan.active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">Inactive</span>}
              </span>
              <span className="mt-0.5 block text-sm text-gray-500">
                {plan.propertyLimit} properties · {plan.imageLimit} photos · {plan.featuredLimit} featured · {plan.analytics} analytics
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-bold text-gray-900">₵{plan.price.toLocaleString()}</span>
              <span className="text-xs text-gray-500">{durationLabel(plan.durationDays)}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm text-gray-500">The agent keeps their current billing period. Plan limits and features update immediately.</p>
      {overLimit && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          {agent.name} has {agent.activeCount} active properties, above the {selected.name} limit of {selected.propertyLimit}. Existing listings stay, but they can't add more until they're under the limit.
        </p>
      )}
    </Modal>
  );
};

const Extend = ({ agent, onClose }) => {
  const { admin } = useAuth();
  const run = useAsyncAction();
  const [days, setDays] = useState(30);
  const base = agent.sub.isActive ? agent.subscription.expiryDate : new Date();

  const save = async () => {
    const { ok } = await run(admin.extendSubscription(agent.id, Number(days)), {
      success: "Subscription extended",
      description: `${agent.name} now expires ${formatDate(addDays(base, Number(days)))}.`,
    });
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Extend subscription"
      description={`${agent.name} · ${agent.sub.isActive ? `expires ${formatDate(agent.subscription.expiryDate)}` : "currently inactive"}`}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn btn-light">Cancel</button>
          <button onClick={save} disabled={!(Number(days) > 0)} className="btn btn-primary">Extend by {days || 0} days</button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-xl py-3 text-sm font-semibold ring-1 transition ${Number(days) === d ? "bg-brand-50 text-brand-700 ring-2 ring-brand-500" : "text-gray-700 ring-gray-200"}`}
          >
            {Number(days) === d && <Check className="mr-1 inline h-3.5 w-3.5" />}
            {d} days
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm">
        <span className="mb-1.5 block font-medium text-gray-700">Custom number of days</span>
        <input type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} className="field" />
      </label>
      <p className="mt-4 text-sm text-gray-500">
        New expiry date: <span className="font-semibold text-gray-900">{Number(days) > 0 ? formatDate(addDays(base, Number(days))) : "—"}</span>
      </p>
    </Modal>
  );
};

// Renders the dialog for an admin subscription action: { type, agent }
const SubscriptionDialogs = ({ action, onClose }) => {
  const { admin } = useAuth();
  const run = useAsyncAction();
  if (!action) return null;
  const { type, agent } = action;

  if (type === "changePlan") return <ChangePlan agent={agent} onClose={onClose} />;
  if (type === "extend") return <Extend agent={agent} onClose={onClose} />;

  if (type === "cancel") {
    return (
      <ConfirmDialog
        open
        onClose={onClose}
        title="Cancel subscription?"
        description={`${agent.name}'s ${agent.subscription?.planName} subscription will end now. Their listings will be hidden and agent tools locked until the subscription is activated again. Their account and data are kept.`}
        confirmLabel="Cancel subscription"
        onConfirm={async () => {
          const { ok } = await run(admin.cancelSubscription(agent.id), { success: "Subscription cancelled", description: agent.name, type: "info" });
          if (ok) onClose();
        }}
      />
    );
  }

  if (type === "activate") {
    const pending = agent.subscription?.status === "pending";
    return (
      <ConfirmDialog
        open
        tone="primary"
        onClose={onClose}
        title={pending ? "Confirm payment and activate?" : "Activate subscription?"}
        description={
          pending
            ? `Mark ${agent.name}'s ${agent.subscription.paymentMethod} payment as received and start their ${agent.subscription.planName} plan today.`
            : agent.sub.isExpired || agent.sub.status === "cancelled"
              ? `Restart ${agent.name}'s ${agent.subscription.planName} plan with a new period starting today.`
              : `Re-activate ${agent.name}'s subscription.`
        }
        confirmLabel="Activate"
        onConfirm={async () => {
          const { ok } = await run(admin.activateSubscription(agent.id), { success: "Subscription activated", description: agent.name });
          if (ok) onClose();
        }}
      />
    );
  }
  return null;
};

export default SubscriptionDialogs;
