import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Check, Copy, Link2, Loader2, Trash2, UserPlus, Users } from "lucide-react";
import PageTitle from "../../components/agent/PageTitle";
import StatusBadge from "../../components/ui/StatusBadge";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import LockedFeature from "../../components/ui/LockedFeature";
import PageLoader from "../../components/ui/PageLoader";
import WhatsAppIcon from "../../components/ui/WhatsAppIcon";
import { useAgentPermissions } from "../../hooks/useAgentPermissions";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { teamApi } from "../../frontApi";
import { formatDate } from "../../utils/date";
import { getInitials } from "../../utils/property";
import { cloudImage } from "../../utils/cloudImage";

const ROLES = {
  manager: { label: "Manager", text: "Sees every agency listing and lead, and assigns work to the team." },
  agent: { label: "Agent", text: "Sees only the listings and leads assigned to them, and can add their own listings." },
};

const Avatar = ({ person }) => (
  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
    {person.profileImage ? <img src={cloudImage(person.profileImage, 40)} alt="" className="h-full w-full object-cover" /> : getInitials(person.name)}
  </span>
);

const Stats = ({ stats }) => (
  <dl className="grid grid-cols-3 gap-4 text-sm sm:w-80">
    <div><dt className="text-xs text-gray-500">Listings</dt><dd className="font-semibold text-gray-900">{stats.listings}<span className="ml-1 text-xs font-normal text-gray-500">({stats.published} live)</span></dd></div>
    <div><dt className="text-xs text-gray-500">Views</dt><dd className="font-semibold text-gray-900">{stats.views.toLocaleString()}</dd></div>
    <div><dt className="text-xs text-gray-500">Leads</dt><dd className="font-semibold text-gray-900">{stats.leads}<span className="ml-1 text-xs font-normal text-gray-500">({stats.openLeads} open)</span></dd></div>
  </dl>
);

// Creates a single-use link and shows it once, ready to copy or share on WhatsApp
const InviteModal = ({ open, onClose, onCreated }) => {
  const run = useAsyncAction();
  const [role, setRole] = useState("agent");
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const close = () => { setInvite(null); setCopied(false); setRole("agent"); onClose(); };
  const create = async () => {
    setBusy(true);
    const { ok, result } = await run(teamApi.createInvite(role));
    setBusy(false);
    if (ok) { setInvite(result); onCreated(); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(invite.url); setCopied(true); } catch { setCopied(false); }
  };
  const message = invite ? `You're invited to join our agency on NyaFie as ${role === "manager" ? "a manager" : "an agent"}: ${invite.url}` : "";

  return (
    <Modal open={open} onClose={close} title={invite ? "Share the invite link" : "Invite a team member"} size="md"
      footer={invite ? <button type="button" onClick={close} className="btn btn-primary">Done</button> : <><button type="button" onClick={close} className="btn btn-light">Cancel</button><button type="button" onClick={create} disabled={busy} className="btn btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Create invite link</button></>}>
      {invite ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Send this link to your new {ROLES[role].label.toLowerCase()}. They sign in or create an agent account with their own password, then join your agency.</p>
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
            <input readOnly value={invite.url} aria-label="Invite link" onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent px-2 text-sm text-gray-800 outline-none" />
            <button type="button" onClick={copy} className="btn btn-light shrink-0 px-3 py-2 text-xs">{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}</button>
          </div>
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="btn w-full bg-emerald-600 text-white hover:bg-emerald-700"><WhatsAppIcon />Share on WhatsApp</a>
          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">The link works once and expires on {formatDate(invite.expiresAt)}. Anyone with it can join, so only share it with your staff member. You won’t be able to see it again, but you can cancel it and create a new one.</p>
        </div>
      ) : (
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-gray-700">Role</legend>
          <div className="grid gap-3">
            {Object.entries(ROLES).map(([value, info]) => (
              <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${role === value ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:border-brand-300"}`}>
                <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="mt-1 accent-brand-500" />
                <span><span className="block text-sm font-semibold text-gray-900">{info.label}</span><span className="mt-0.5 block text-xs text-gray-600">{info.text}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </Modal>
  );
};

const Team = () => {
  const perms = useAgentPermissions();
  const run = useAsyncAction();
  const [attempt, setAttempt] = useState(0);
  const team = useApiQuery(`team:${attempt}`, () => teamApi.getTeam());
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(null);
  const reload = () => setAttempt((n) => n + 1);

  if (!perms.canViewTeam) return <Navigate to="/agent/dashboard" replace />;
  const data = team.data || team.previous;
  if (!data) return team.error ? <LockedFeature title="Team unavailable" description={team.error} cta={null} /> : <PageLoader label="Loading your team..." />;

  const owner = perms.canManageTeam;
  const used = data.members.length + data.invites.length;
  const changeRole = async (member, role) => {
    setBusy(member.id);
    const { ok } = await run(teamApi.updateMember(member.id, role), { success: `${member.name} is now ${role === "manager" ? "a manager" : "an agent"}` });
    setBusy(null);
    if (ok) reload();
  };
  const remove = async () => {
    setBusy(removing.id);
    const { ok } = await run(teamApi.removeMember(removing.id), { success: `${removing.name} was removed`, description: "Their listings and leads are back with you." });
    setBusy(null);
    if (ok) { setRemoving(null); reload(); }
  };
  const cancelInvite = async (invite) => {
    setBusy(invite.id);
    const { ok } = await run(teamApi.revokeInvite(invite.id), { success: "Invite cancelled", type: "info" });
    setBusy(null);
    if (ok) reload();
  };

  return (
    <div className="space-y-6">
      <PageTitle eyebrow={perms.accountType === "company" ? "Your company" : "Your agency"} title="Team" description="Invite staff, set their roles and see how their listings and leads are doing."
        action={owner && <button type="button" onClick={() => setInviting(true)} disabled={!data.canInvite} className="btn btn-primary"><UserPlus className="h-4 w-4" />Invite member</button>} />

      {owner && data.limit === 0 ? (
        <LockedFeature title="Team members" description="Your current plan doesn't include team members. Upgrade to a plan with team members to invite staff, assign listings and share leads." to={perms.upgradePath} />
      ) : owner && (
        <p className="text-sm text-gray-600"><span className="font-semibold text-gray-900">{used} of {data.limit}</span> team places used{data.invites.length ? `, including ${data.invites.length} open ${data.invites.length === 1 ? "invite" : "invites"}` : ""}.{!data.canInvite && used >= data.limit && " Upgrade your plan to add more people."}</p>
      )}

      <section className="workspace-card">
        <div className="workspace-card-header"><div><h2>Members</h2><p>Listings and leads not assigned to anyone stay with the owner.</p></div></div>
        <ul className="divide-y divide-gray-100">
          <li className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3"><Avatar person={data.owner} /><div className="min-w-0"><p className="truncate font-semibold text-gray-900">{data.owner.name}</p><p className="truncate text-xs text-gray-500">{data.owner.email}</p></div><StatusBadge status="Owner" tone="brand" dot={false} /></div>
            <Stats stats={data.owner.stats} />
          </li>
          {data.members.map((member) => (
            <li key={member.id} className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar person={member} />
                <div className="min-w-0"><p className="truncate font-semibold text-gray-900">{member.name}</p><p className="truncate text-xs text-gray-500">{member.email} · joined {formatDate(member.joinedAt)}</p></div>
                {!owner && <StatusBadge status={ROLES[member.role].label} tone="gray" dot={false} />}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Stats stats={member.stats} />
                {owner && (
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${member.id}`}>Role for {member.name}</label>
                    <select id={`role-${member.id}`} value={member.role} disabled={busy === member.id} onChange={(e) => changeRole(member, e.target.value)} className="field w-auto py-2 text-sm">
                      {Object.entries(ROLES).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
                    </select>
                    <button type="button" onClick={() => setRemoving(member)} aria-label={`Remove ${member.name}`} className="grid h-10 w-10 place-items-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            </li>
          ))}
          {!data.members.length && (
            <li className="flex flex-col items-center px-6 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Users className="h-5 w-5" /></span>
              <p className="mt-3 font-semibold text-gray-900">No team members yet</p>
              <p className="mt-1 max-w-sm text-sm text-gray-500">{owner ? "Invite your staff to share the work: assign them listings and leads, and see how each person is doing." : "The agency owner hasn't added anyone else yet."}</p>
            </li>
          )}
        </ul>
      </section>

      {owner && data.invites.length > 0 && (
        <section className="workspace-card">
          <div className="workspace-card-header"><div><h2>Open invites</h2><p>Each link works once. Cancel one if it was shared by mistake.</p></div></div>
          <ul className="divide-y divide-gray-100">
            {data.invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 text-sm">
                <span className="flex items-center gap-3"><Link2 className="h-4 w-4 text-gray-400" /><span className="font-medium text-gray-900">{ROLES[invite.role].label} invite</span><span className="text-gray-500">expires {formatDate(invite.expiresAt)}</span></span>
                <button type="button" onClick={() => cancelInvite(invite)} disabled={busy === invite.id} className="text-sm font-semibold text-red-600 hover:text-red-700">Cancel invite</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <InviteModal open={inviting} onClose={() => setInviting(false)} onCreated={reload} />
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} disabled={busy === removing?.id}
        title={`Remove ${removing?.name}?`} confirmLabel={busy === removing?.id ? "Removing..." : "Remove from team"}
        description="They lose access to the agency straight away. Nothing is deleted: their listings and leads come back to you, and you can assign them to someone else." />
    </div>
  );
};

export default Team;
