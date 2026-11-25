import { useState } from "react";
import { Laptop, Loader2, LogOut, Smartphone } from "lucide-react";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import { useApiQuery } from "../../hooks/useApiQuery";
import { timeAgo } from "../../utils/date";
import { orderSessions, otherDevices, sessionDetail } from "../../utils/sessions";

const isPhone = (device) => /iPhone|iPad|Android/.test(device);

/**
 * Where this account is signed in: every device, with a button to end each one, the others, or all.
 * Ending a session takes effect on that device's next action.
 */
const SignedInDevices = ({ className = "" }) => {
  const { user, domain, listSessions, endSession } = useAuth();
  const { toast } = useToast();
  const query = useApiQuery(user ? `sessions:${domain}:${user.id}` : null, listSessions);
  const [busy, setBusy] = useState("");
  const [confirming, setConfirming] = useState(false);
  const sessions = orderSessions(query.data || query.previous);
  const others = otherDevices(sessions);

  const end = async (target) => {
    setBusy(target);
    try {
      const result = await endSession(target);
      toast({ title: result.message });
      if (!result.data?.signedOut) query.reload();
    } catch (error) {
      toast({ type: "error", title: "Couldn't sign out", description: error.message });
      query.reload();
    } finally { setBusy(""); }
  };

  return (
    <div className={className}>
      {query.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{query.error} <button type="button" onClick={query.reload} className="font-semibold underline underline-offset-2">Try again</button></p>}
      {!sessions.length && query.loading && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Checking your devices…</p>}
      <ul className="divide-y divide-gray-100" aria-busy={query.loading}>
        {sessions.map((session) => {
          const Icon = isPhone(session.device) ? Smartphone : Laptop;
          return (
            <li key={session.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1 basis-44">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">{session.device}{session.current && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">This device</span>}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{sessionDetail(session)}</p>
                <p className="text-xs text-gray-500">{session.current ? "Active now" : `Last used ${timeAgo(session.lastUsedAt)}`}</p>
              </div>
              {!session.current && <button type="button" disabled={Boolean(busy)} onClick={() => end(session.id)} aria-label={`Sign out of ${session.device}, ${sessionDetail(session)}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50">{busy === session.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <LogOut className="h-3.5 w-3.5" aria-hidden="true" />}Sign out</button>}
            </li>
          );
        })}
      </ul>
      {sessions.length > 0 && (
        <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-4">
          {others > 0 && <button type="button" disabled={Boolean(busy)} onClick={() => end("others")} className="btn btn-light px-4 py-2 text-sm">{busy === "others" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Sign out of {others === 1 ? "the other device" : `${others} other devices`}</button>}
          <button type="button" disabled={Boolean(busy)} onClick={() => setConfirming(true)} className="btn btn-light px-4 py-2 text-sm text-red-600">Sign out of all devices</button>
        </div>
      )}
      <p className="mt-4 text-xs leading-relaxed text-gray-500">Don't recognise one? Sign it out, then change your password.</p>
      <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={() => { setConfirming(false); end("all"); }} title="Sign out of all devices?" confirmLabel="Sign out everywhere" description="You'll be signed out here too, and need to sign in again." />
    </div>
  );
};

export default SignedInDevices;
