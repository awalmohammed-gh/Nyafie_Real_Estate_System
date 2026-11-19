import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CalendarX2, Check, CheckCheck, Loader2, Mail, MessageCircle, Phone, Repeat, UserX, X } from "lucide-react";
import StatusBadge from "../ui/StatusBadge";
import WhatsAppIcon from "../ui/WhatsAppIcon";
import ViewingTimeFields from "./ViewingTimeFields";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { viewingApi } from "../../frontApi";
import { formatViewingTime, viewingParts } from "../../utils/viewingTimes";
import { formatRelative } from "../../utils/date";
import { toWhatsAppNumber } from "../../utils/whatsapp";
import { adminPath } from "../../utils/adminEntry";
import { cloudImage } from "../../utils/cloudImage";

const OPEN = ["requested", "confirmed"];
const SUCCESS = { confirm: "Viewing confirmed", accept: "Viewing confirmed", propose: "New time suggested", decline: "Viewing request declined", cancel: "Viewing cancelled", complete: "Marked as completed", missed: "Marked as missed" };

// What the card says about where the viewing stands, for each side
const situation = (viewing, side, started) => {
  const other = side === "owner" ? "the customer" : "the owner";
  if (viewing.statusKey === "requested") {
    if (viewing.awaiting !== side) return `Waiting for ${other} to answer.`;
    if (started) return "This time has passed. Suggest a new one.";
    return side === "owner" ? "The customer asked for this time. Confirm it or suggest another." : "The owner suggested this time. Accept it or suggest another.";
  }
  if (viewing.statusKey === "confirmed") return started ? (side === "owner" ? "This viewing's time has started. Mark how it went." : "This viewing's time has started.") : "Confirmed by both sides.";
  if (viewing.statusKey === "cancelled") return `Cancelled by ${viewing.cancelledBy === side ? "you" : other}.`;
  return { declined: "The owner declined this request.", completed: "The viewing took place.", missed: "Marked as missed by the owner.", expired: "Nobody answered before the time passed." }[viewing.statusKey] || "";
};

/**
 * One viewing with the actions open to `side` ("customer" or "owner"). `scope` ("customer" | "agent" |
 * "admin") picks the chat link. Calls onChange with the updated viewing.
 */
const ViewingCard = ({ viewing, side, scope = side === "customer" ? "customer" : "agent", onChange }) => {
  const run = useAsyncAction();
  const [mode, setMode] = useState(null); // null | propose | cancel | decline
  const [when, setWhen] = useState({ date: "", time: "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const now = new Date();
  const started = new Date(viewing.scheduledAt) <= now;
  const open = OPEN.includes(viewing.statusKey);
  const myTurn = viewing.awaiting === side;
  const owner = side === "owner";
  const chatLink = !viewing.conversationId ? null
    : scope === "customer" ? `/account/messages?c=${viewing.conversationId}`
      : scope === "admin" ? viewing.ownerType === "admin" && adminPath(`/messages?c=${viewing.conversationId}`)
        : `/agent/messages?c=${viewing.conversationId}`;
  const whatsapp = owner && viewing.contactPhone && toWhatsAppNumber(viewing.contactPhone);

  const act = async (action, extra = {}) => {
    setBusy(action);
    const { ok, result } = await run(viewingApi.updateViewing(viewing.id, action, { ...extra, message: note.trim() }), { success: SUCCESS[action], description: owner ? "The customer has been notified." : "The owner has been notified." });
    setBusy("");
    if (ok) {
      setMode(null);
      setNote("");
      onChange?.(result);
    }
  };
  const startPropose = () => { setWhen(started ? { date: "", time: "" } : viewingParts(viewing.scheduledAt)); setNote(""); setMode("propose"); };
  const button = (action, label, Icon, className = "btn btn-light", onClick = () => act(action)) => (
    <button type="button" onClick={onClick} disabled={Boolean(busy)} className={`${className} px-4 py-2 text-xs`}>
      {busy === action ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </button>
  );

  return (
    <li className="flex flex-col gap-4 rounded-3xl bg-white p-4 ring-1 ring-gray-200 sm:flex-row sm:p-5">
      <Link to={`/house/${viewing.property.id}`} className="shrink-0">
        {viewing.property.image ? (
          <img src={cloudImage(viewing.property.image, 400)} alt="" className="aspect-video w-full rounded-2xl object-cover sm:h-28 sm:w-40" />
        ) : (
          <div className="grid h-28 w-full place-items-center rounded-2xl bg-gray-100 text-xs text-gray-400 sm:w-40">Listing removed</div>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-lg font-bold text-gray-900"><CalendarClock className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />{formatViewingTime(viewing.scheduledAt)}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-gray-800">{viewing.property.title}</p>
            <p className="text-sm text-gray-500">{[viewing.property.location, owner ? `Booked by ${viewing.customer?.name || viewing.contactName}` : `With ${viewing.owner?.name}`].filter(Boolean).join(" · ")}</p>
          </div>
          <StatusBadge status={myTurn ? "Needs your answer" : viewing.status} />
        </div>

        <p className={`mt-3 text-sm ${myTurn ? "font-medium text-amber-800" : "text-gray-600"}`}>{situation(viewing, side, started)}</p>
        {viewing.message && <p className="mt-3 rounded-2xl bg-gray-50 p-3 text-sm text-gray-600"><span className="font-medium text-gray-800">{owner ? "Customer's note" : "Your note"}:</span> “{viewing.message}”</p>}
        {viewing.response && <p className="mt-2 rounded-2xl bg-sky-50 p-3 text-sm text-sky-900"><span className="font-medium">Latest note:</span> “{viewing.response}”</p>}

        {owner && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {viewing.contactPhone && <a href={`tel:${viewing.contactPhone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"><Phone className="h-4 w-4" aria-hidden="true" />{viewing.contactPhone}</a>}
            {whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:underline"><WhatsAppIcon className="h-4 w-4" />WhatsApp</a>}
            {viewing.customer?.email && <a href={`mailto:${viewing.customer.email}`} className="inline-flex items-center gap-1.5 text-gray-600 hover:underline"><Mail className="h-4 w-4" aria-hidden="true" />{viewing.customer.email}</a>}
          </div>
        )}

        {mode === "propose" && (
          <form onSubmit={(e) => { e.preventDefault(); act("propose", when); }} className="mt-4 space-y-3 rounded-2xl bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">Suggest another time</p>
            <ViewingTimeFields value={when} onChange={setWhen} disabled={Boolean(busy)} />
            <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" className="field resize-none" aria-label="Note" />
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setMode(null)} className="btn btn-light px-4 py-2 text-xs">Back</button>
              <button type="submit" disabled={Boolean(busy) || !when.date || !when.time} className="btn btn-primary px-4 py-2 text-xs">{busy === "propose" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}Send new time</button>
            </div>
          </form>
        )}
        {(mode === "cancel" || mode === "decline") && (
          <div className="mt-4 space-y-3 rounded-2xl bg-red-50/60 p-4">
            <p className="text-sm font-semibold text-gray-900">{mode === "cancel" ? "Cancel this viewing?" : "Decline this request?"}</p>
            <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional), shared with the other side" className="field resize-none" aria-label="Reason" />
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setMode(null)} className="btn btn-light px-4 py-2 text-xs">Back</button>
              {button(mode, mode === "cancel" ? "Cancel viewing" : "Decline request", X, "btn bg-red-600 text-white hover:bg-red-700")}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-400">Requested {formatRelative(viewing.createdAt)}</p>
          {!mode && (
            <div className="flex flex-wrap gap-2">
              {open && myTurn && !started && button(owner ? "confirm" : "accept", owner ? "Confirm" : "Accept time", Check, "btn btn-primary")}
              {owner && viewing.statusKey === "confirmed" && started && (<>
                {button("complete", "Completed", CheckCheck, "btn btn-primary")}
                {button("missed", "Missed", UserX)}
              </>)}
              {open && !(owner && viewing.statusKey === "confirmed" && started) && button("propose", myTurn ? "Suggest another time" : "Change time", Repeat, "btn btn-light", startPropose)}
              {open && myTurn && owner && button("decline", "Decline", CalendarX2, "btn btn-light", () => { setNote(""); setMode("decline"); })}
              {open && !started && !(myTurn && owner) && button("cancel", "Cancel", X, "btn btn-light", () => { setNote(""); setMode("cancel"); })}
              {chatLink && <Link to={chatLink} className="btn btn-light px-4 py-2 text-xs"><MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />Chat</Link>}
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

export default ViewingCard;
