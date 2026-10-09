import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, ChevronRight, CircleDashed, RefreshCw, XCircle } from "lucide-react";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import DataTable from "../../components/ui/DataTable";
import StatusBadge from "../../components/ui/StatusBadge";
import SidePanel from "../../components/ui/SidePanel";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import FilterTabs from "../../components/ui/FilterTabs";
import EmptyState from "../../components/ui/EmptyState";
import SearchInput from "../../components/ui/SearchInput";
import { ErrorState, TableSkeleton } from "../../components/dashboard/States";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import { usePlatform } from "../../context/usePlatform";
import { adminApi } from "../../frontApi";
import { formatDate } from "../../utils/date";
import { getSubscriptionState } from "../../utils/subscription";
import { getInitials } from "../../utils/property";

// Photo, or initials on a soft violet circle
const Avatar = ({ name, image, large = false }) => (
  <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 font-semibold text-brand-700 ${large ? "h-16 w-16 text-lg" : "h-9 w-9 text-xs"}`} aria-hidden="true">
    {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : getInitials(name)}
  </span>
);

const STATUSES = ["pending", "incomplete", "approved", "rejected", "suspended", "all"];
const STATUS_LABEL = { all: "All", pending: "Pending review", incomplete: "Not submitted", approved: "Approved", rejected: "Rejected", suspended: "Suspended" };
const ACTION_LABEL = { approve: "Approve", reject: "Reject", suspend: "Suspend", reactivate: "Reactivate" };
const statusOf = (agent) => (agent.status === "suspended" ? "suspended" : agent.agentApplication?.status || "incomplete");
const REVIEW_ACTIONS = { pending: ["approve", "reject"], approved: ["suspend"], suspended: ["reactivate"] };
const agentType = (agent) => ({ agency: "Agency", company: "Company" })[agent.agentApplication?.agentType] || "Individual agent";

// The same requirements the server checks before it allows approval
const eligibility = (agent, requireSubscription) => {
  const state = getSubscriptionState(agent.subscription);
  const paid = ["paid", "waived"].includes(agent.subscription?.paymentStatus);
  const profile = Boolean(agent.agentApplication?.profileCompletedAt);
  const subscription = !requireSubscription || (state.isActive && paid);
  return {
    profile,
    subscription,
    eligible: profile && subscription,
    state,
    subscriptionText: !requireSubscription && !agent.subscription ? "Not required" : agent.subscription ? `${agent.subscription.planName} · ${state.statusLabel}` : "No plan yet",
  };
};

const Check = ({ ok, label, detail }) => (
  <li className="flex items-start gap-3">
    {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" aria-hidden="true" />}
    <span className="min-w-0">
      <span className="block text-sm font-medium text-gray-900">{label}<span className="sr-only">{ok ? ": met" : ": not met"}</span></span>
      {detail && <span className="block text-xs text-gray-500">{detail}</span>}
    </span>
  </li>
);

const Section = ({ title, children }) => (
  <section className="border-t border-gray-100 pt-5 first:border-0 first:pt-0">
    <h3 className="mb-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">{title}</h3>
    {children}
  </section>
);

const Facts = ({ items }) => (
  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
    {items.map(([name, value]) => (
      <div key={name} className="min-w-0">
        <dt className="text-gray-500">{name}</dt>
        <dd className="mt-0.5 font-medium wrap-break-word text-gray-900">{value || <span className="font-normal text-gray-400">Not provided</span>}</dd>
      </div>
    ))}
  </dl>
);

const AdminAgentApplications = () => {
  const { refreshUsers } = useAuth();
  const { settings } = usePlatform();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const query = useApiQuery("agent-applications", adminApi.getAgentApplications);
  const agents = query.data || query.previous || [];
  const counts = Object.fromEntries(STATUSES.map((id) => [id, agents.filter((agent) => id === "all" || statusOf(agent) === id).length]));
  // Opens on the review queue; once that is empty, on every application
  const [chosenStatus, setStatus] = useState(params.get("status"));
  const status = STATUSES.includes(chosenStatus) ? chosenStatus : counts.pending ? "pending" : "all";
  const [search, setSearch] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requireSubscription = settings.agent.requireSubscription;

  const selected = agents.find((agent) => agent.id === params.get("open"));
  const show = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set("open", id);
    else next.delete("open");
    setParams(next, { replace: true });
  };
  const term = search.trim().toLowerCase();
  const filtered = agents.filter((agent) => (status === "all" || statusOf(agent) === status) && `${agent.name} ${agent.email} ${agent.phone} ${agent.agentApplication?.companyName || ""}`.toLowerCase().includes(term));

  const confirm = (agent, action) => {
    setReason("");
    setError("");
    setConfirmation({ agent, action });
  };
  const review = async () => {
    if (busy) return; // no double submissions
    setBusy(true);
    setError("");
    try {
      await adminApi.reviewAgentApplication(confirmation.agent.id, confirmation.action, reason);
      await refreshUsers();
      query.reload();
      toast({ title: `Application ${{ approve: "approved", reject: "rejected", suspend: "suspended", reactivate: "reactivated" }[confirmation.action]}`, description: confirmation.agent.name });
      setConfirmation(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitted = (agent) => (agent.agentApplication?.submittedAt ? formatDate(agent.agentApplication.submittedAt) : "Not submitted");
  const columns = [
    {
      key: "agent",
      header: "Agent",
      render: (agent) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={agent.name} image={agent.profileImage} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-gray-900">{agent.name}</span>
            <span className="block truncate text-xs text-gray-500">{agent.email}</span>
          </span>
        </span>
      ),
    },
    { key: "type", header: "Type", render: (agent) => <span className="text-gray-700">{agentType(agent)}</span> },
    { key: "subscription", header: "Subscription", render: (agent) => <span className="text-gray-700">{eligibility(agent, requireSubscription).subscriptionText}</span> },
    { key: "date", header: "Submitted", render: (agent) => <span className="whitespace-nowrap text-gray-700">{submitted(agent)}</span> },
    { key: "status", header: "Status", render: (agent) => <StatusBadge status={STATUS_LABEL[statusOf(agent)]} /> },
    { key: "open", header: <span className="sr-only">Open</span>, align: "right", render: (agent) => <button type="button" onClick={() => show(agent.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">Review<ChevronRight className="h-4 w-4" /></button> },
  ];

  const check = selected ? eligibility(selected, requireSubscription) : null;
  const app = selected?.agentApplication || {};
  const actions = selected ? REVIEW_ACTIONS[statusOf(selected)] || [] : [];

  return (
    <>
      <AdminPageTitle
        title="Agent Applications"
        description="Agents can open their dashboard only after you approve them. Approval needs a complete profile and, when required, a paid and active subscription."
        action={<button type="button" className="btn btn-light min-h-11" onClick={query.reload}><RefreshCw className="h-4 w-4" />Refresh</button>}
      />

      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterTabs label="Application status" value={status} onChange={setStatus} tabs={STATUSES.map((id) => ({ id, label: STATUS_LABEL[id], count: counts[id] }))} />
        <div className="xl:w-80"><SearchInput value={search} onChange={setSearch} placeholder="Search name, email, phone or company" /></div>
      </div>

      {query.error && !query.previous ? (
        <ErrorState message={query.error} onRetry={query.reload} />
      ) : !query.data && !query.previous ? (
        <TableSkeleton />
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          minWidth={820}
          onRowClick={(agent) => show(agent.id)}
          empty={<EmptyState title={status === "pending" ? "No applications waiting for review" : "No applications found"} description={term ? "Try a different search." : "Agents appear here after they create an account."} />}
          mobileCard={(agent) => (
            <button type="button" onClick={() => show(agent.id)} className="flex w-full items-center gap-3 text-left">
              <Avatar name={agent.name} image={agent.profileImage} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-gray-900">{agent.name}</span>
                <span className="block truncate text-xs text-gray-500">{agentType(agent)} · {eligibility(agent, requireSubscription).subscriptionText}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-2"><StatusBadge status={STATUS_LABEL[statusOf(agent)]} /><span className="text-xs text-gray-500">{submitted(agent)}</span></span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
            </button>
          )}
        />
      )}

      <SidePanel
        open={Boolean(selected)}
        onClose={() => show(null)}
        title={selected?.name}
        description={selected ? `${STATUS_LABEL[statusOf(selected)]} · ${agentType(selected)}` : ""}
        footer={
          selected && (
            <div className="flex w-full flex-wrap items-center gap-2">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => confirm(selected, action)}
                  disabled={busy || (action === "approve" && !check.eligible)}
                  className={["reject", "suspend"].includes(action) ? "btn min-h-11 border border-red-200 bg-white px-4 text-red-700 hover:bg-red-50" : "btn btn-primary min-h-11 px-5"}
                >
                  {ACTION_LABEL[action]}
                </button>
              ))}
              {!actions.length && <p className="text-sm text-gray-500">{statusOf(selected) === "incomplete" ? "No decision needed yet: the agent hasn’t finished onboarding." : "No action available for this status."}</p>}
              {actions.includes("approve") && !check.eligible && <p className="w-full text-xs text-gray-500">Approval unlocks once the requirements under “Subscription eligibility” are met.</p>}
            </div>
          )
        }
      >
        {selected && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar name={selected.name} image={selected.profileImage} large />
              <div className="min-w-0">
                <StatusBadge status={STATUS_LABEL[statusOf(selected)]} />
                <p className="mt-2 truncate text-sm text-gray-700">{selected.email}</p>
                <p className="text-sm text-gray-500">{selected.phone || "No phone number"}</p>
              </div>
            </div>

            <Section title="Professional details">
              <Facts
                items={[
                  ["Agent type", agentType(selected)],
                  ...(["agency", "company"].includes(app.agentType) ? [[app.agentType === "company" ? "Company" : "Agency", app.companyName]] : []),
                  ["Region", app.region],
                  ["City / area", app.city],
                  ["Office address", app.officeAddress],
                  ["GhanaPost GPS", app.ghanaPostGPS],
                  ["Years of experience", app.yearsExperience != null ? String(app.yearsExperience) : ""],
                ]}
              />
              <div className="mt-4">
                <p className="text-sm text-gray-500">Short bio</p>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-gray-800">{app.bio || <span className="text-gray-400">Not provided</span>}</p>
              </div>
              {app.agencyLogo && <img src={app.agencyLogo} alt={`${app.companyName || "Agency"} logo`} className="mt-4 max-h-20 max-w-full rounded-lg object-contain ring-1 ring-gray-200" />}
            </Section>

            <Section title="Subscription eligibility">
              <ul className="space-y-3">
                <Check ok={check.profile} label="Agent profile complete" detail={app.profileCompletedAt ? `Completed ${formatDate(app.profileCompletedAt)}` : "The agent hasn’t finished their profile"} />
                <Check
                  ok={check.subscription}
                  label={requireSubscription ? "Paid, active subscription" : "Subscription not required"}
                  detail={
                    !requireSubscription
                      ? "Turned off in Settings › Agents & Plans"
                      : selected.subscription
                        ? `${selected.subscription.planName} · payment ${selected.subscription.paymentStatus} · ${check.state.isActive ? `active until ${formatDate(selected.subscription.expiryDate)}` : check.state.statusLabel.toLowerCase()}`
                        : "No plan purchased yet"
                  }
                />
              </ul>
              <p className={`mt-4 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm ${check.eligible ? "bg-emerald-50 text-emerald-900" : "bg-gray-50 text-gray-700"}`}>
                {check.eligible ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <CircleDashed className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />}
                {check.eligible ? "Meets every requirement for approval." : "Not eligible for approval yet."}
              </p>
            </Section>

            <Section title="Review">
              <Facts
                items={[
                  ["Submitted for review", submitted(selected)],
                  ["Last reviewed", app.reviewedAt ? formatDate(app.reviewedAt) : "Not reviewed yet"],
                  ["Approved", app.approvedAt ? formatDate(app.approvedAt) : "Not approved"],
                ]}
              />
              {app.rejectionReason && (
                <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
                  <p className="font-semibold">Feedback sent to the agent</p>
                  <p className="mt-1 whitespace-pre-wrap">{app.rejectionReason}</p>
                </div>
              )}
            </Section>
          </div>
        )}
      </SidePanel>

      <ConfirmDialog
        open={Boolean(confirmation)}
        onClose={() => !busy && setConfirmation(null)}
        onConfirm={review}
        disabled={busy}
        title={confirmation ? `${ACTION_LABEL[confirmation.action]} ${confirmation.agent.name}?` : "Review application"}
        confirmLabel={busy ? "Saving…" : confirmation ? ACTION_LABEL[confirmation.action] : "Confirm"}
        tone={["approve", "reactivate"].includes(confirmation?.action) ? "brand" : "danger"}
        description={
          confirmation &&
          {
            approve: "They get access to the agent dashboard and can start listing properties. The server re-checks their profile and subscription first.",
            reject: "They’ll see your feedback and can update their profile and apply again. Their subscription is kept.",
            suspend: "Their dashboard access and public listings are blocked until you reactivate them.",
            reactivate: "Their previous access is restored if they had been approved before.",
          }[confirmation.action]
        }
      >
        {confirmation?.action === "reject" && (
          <label className="block text-sm font-semibold text-gray-900">
            Feedback for the agent <span className="font-normal text-gray-500">(optional)</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={4} placeholder="What should they change before applying again?" className="field mt-2 font-normal" />
          </label>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </ConfirmDialog>
    </>
  );
};

export default AdminAgentApplications;
