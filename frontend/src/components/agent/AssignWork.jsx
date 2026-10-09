import { useState } from "react";
import { Loader2, UserRoundCheck } from "lucide-react";
import { teamApi } from "../../frontApi";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAsyncAction } from "../../hooks/useAsyncAction";

/**
 * "Assigned to" for agency owners and managers: hand a listing or lead to a team member, or back to
 * the owner. assign(memberId) performs the change; the server checks the member belongs to the agency.
 * Staff agents see who handles it, read-only.
 */
const AssignWork = ({ assignedTo, canAssign, assign, onDone, label = "Assigned to", note }) => {
  const run = useAsyncAction();
  const team = useApiQuery(canAssign ? "team-members" : "team-members:none", () => (canAssign ? teamApi.getTeam() : Promise.resolve(null)));
  const [busy, setBusy] = useState(false);
  const data = team.data || team.previous;
  if (!canAssign) return null;
  if (!data) return <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading your team...</p>;

  const people = [{ id: "", name: `${data.owner.name} (owner)` }, ...data.members.map((m) => ({ id: m.id, name: `${m.name} · ${m.role === "manager" ? "Manager" : "Agent"}` }))];
  const change = async (memberId) => {
    setBusy(true);
    const person = people.find((p) => p.id === memberId);
    const { ok } = await run(assign(memberId || null), { success: memberId ? `Assigned to ${person?.name.split(" · ")[0]}` : "Returned to the owner" });
    setBusy(false);
    if (ok) onDone?.();
  };

  return (
    <div>
      <label className="block text-sm">
        <span className="mb-1.5 flex items-center gap-2 font-medium text-gray-700"><UserRoundCheck className="h-4 w-4 text-brand-600" aria-hidden="true" />{label}</span>
        <span className="flex items-center gap-2">
          <select value={assignedTo || ""} onChange={(e) => change(e.target.value)} disabled={busy} className="field py-2.5">
            {people.map((person) => <option key={person.id || "owner"} value={person.id}>{person.name}</option>)}
          </select>
          {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" aria-label="Saving" />}
        </span>
      </label>
      {note && <p className="mt-1.5 text-xs text-gray-500">{note}</p>}
      {!data.members.length && <p className="mt-1.5 text-xs text-gray-500">Invite team members from the Team page to share the work.</p>}
    </div>
  );
};

export default AssignWork;
