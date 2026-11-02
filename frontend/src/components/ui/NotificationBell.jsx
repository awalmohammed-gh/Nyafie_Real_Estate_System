import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Bell, BellOff, Building, CheckCheck, ClipboardCheck, CreditCard, HandCoins, KeyRound, Loader2, MessageCircle, RefreshCw, Star, Trash2, UserPlus, X } from "lucide-react";
import { useNotifications } from "../../hooks/useNotifications";
import { useScrim } from "../../hooks/useScrim";
import { useToast } from "../../context/useToast";
import { timeAgo } from "../../utils/date";
import ConfirmDialog from "./ConfirmDialog";
import PageLoader from "./PageLoader";
import { resolveAdminLink } from "../../utils/adminEntry";

const ICONS = { message: MessageCircle, offer: HandCoins, rental: KeyRound, sale: Building, payment: CreditCard, status: RefreshCw, user: UserPlus, review: ClipboardCheck, customer_review: Star };
const plural = (count) => `${count} ${count === 1 ? "notification" : "notifications"}`;

// A real checkbox inside a 44px tap target
const Check = ({ checked, onChange, label, indeterminate = false }) => {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-gray-100">
      <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="h-4.5 w-4.5 cursor-pointer rounded accent-brand-500" />
    </label>
  );
};

/**
 * In-app notifications for the signed-in account (customers, agents and admins).
 * A dropdown by the bell on larger screens; a full-width panel below the header on phones.
 * Select one, several or all notifications to mark them read or delete them; the server only
 * ever changes the signed-in account's own notifications.
 * onDark: white icon for the transparent navbar over a hero
 */
const NotificationBell = ({ className = "", onDark = false }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { items, unread, loaded, error, reload, markRead, markAllRead, markSelectedRead, remove, removeAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null); // "selected" | "all"
  const [busy, setBusy] = useState(null); // an item id, "selected", "all" or "read"
  const containerRef = useRef(null);
  const panelId = useId();
  useScrim(open, () => setOpen(false)); // page blur on the public site (no-op in the dashboards)

  // Selection only ever holds notifications that are still in the list
  const visibleSelected = items.filter((item) => selected.has(item.id)).map((item) => item.id);
  const count = visibleSelected.length;
  const allSelected = items.length > 0 && count === items.length;

  useEffect(() => {
    // The confirmation dialog is outside this element: keep the panel open while it shows
    if (!open || confirm) return undefined;
    const handlePointer = (e) => !containerRef.current?.contains(e.target) && setOpen(false);
    const handleKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, confirm]);

  const toggle = () => {
    if (open) setSelected(new Set());
    else reload();
    setOpen((prev) => !prev);
  };

  const openItem = (item) => {
    setOpen(false);
    setSelected(new Set());
    if (!item.read) markRead(item.id).catch(() => {});
    if (item.link) navigate(resolveAdminLink(item.link));
  };

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  // Runs a delete with a local busy state and a toast; the list is restored if it fails
  const run = async (key, action, success) => {
    setBusy(key);
    try {
      await action();
      toast({ title: success });
      return true;
    } catch {
      toast({ type: "error", title: "Unable to delete notifications", description: "Your notifications were not changed. Please try again." });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const deleteOne = (item) => run(item.id, () => remove([item.id]), "Notification deleted").then((done) => done && setSelected((prev) => { const next = new Set(prev); next.delete(item.id); return next; }));

  const confirmDelete = async () => {
    const all = confirm === "all";
    const ids = visibleSelected;
    const done = await run(confirm, all ? removeAll : () => remove(ids), all ? "All notifications deleted" : `${plural(ids.length)} deleted`);
    if (done) {
      setSelected(new Set());
      setConfirm(null);
    }
  };

  const readSelected = async () => {
    setBusy("read");
    try {
      await markSelectedRead(visibleSelected);
      setSelected(new Set());
    } catch {
      toast({ type: "error", title: "Unable to update notifications", description: "Please try again." });
    } finally {
      setBusy(null);
    }
  };

  const selectedUnread = items.some((item) => selected.has(item.id) && !item.read);
  const portalTarget = typeof document === "undefined" ? null : containerRef.current?.closest(".dash") || document.body;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className={`relative grid h-10 w-10 place-items-center rounded-full transition ${
          onDark ? `text-white/90 hover:bg-white/10 hover:text-white ${open ? "bg-white/15" : ""}` : `text-gray-600 hover:bg-gray-100 hover:text-gray-900 ${open ? "bg-gray-100" : ""}`
        }`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className={`absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ${onDark ? "ring-transparent" : "ring-white"}`} aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            // Phones: full width under the header. Larger screens: a dropdown aligned to the bell.
            className="fixed inset-x-2 top-[4.25rem] z-50 flex max-h-[calc(100dvh-5rem)] origin-top flex-col overflow-hidden rounded-2xl glass-panel text-left shadow-2xl ring-1 shadow-gray-900/10 ring-gray-100 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-3 sm:max-h-[min(34rem,calc(100dvh-6rem))] sm:w-[25rem] sm:origin-top-right"
          >
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-gray-100 px-4 py-3">
              <p className="flex items-center gap-2 font-semibold text-gray-900">
                Notifications
                {unread > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{unread} new</span>}
              </p>
              {unread > 0 && (
                <button type="button" onClick={() => markAllRead().catch(() => {})} className="-mr-2 flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-brand-600 hover:bg-brand-50 hover:text-brand-800">
                  <CheckCheck className="h-4 w-4" aria-hidden="true" />
                  Mark all as read
                </button>
              )}
            </div>

            {/* Selection toolbar: select all + delete all, or the selected-items actions */}
            {items.length > 0 && (
              <div className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-gray-100 py-1 pr-3 pl-2 ${count ? "bg-brand-50/60" : ""}`}>
                <div className="flex items-center">
                  <Check checked={allSelected} indeterminate={count > 0 && !allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))} label={allSelected ? "Clear selection" : "Select all notifications"} />
                  <span className="text-xs font-medium text-gray-600" aria-live="polite">{count ? `${count} selected` : "Select all"}</span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  {count > 0 ? (
                    <>
                      {selectedUnread && (
                        <button type="button" onClick={readSelected} disabled={busy === "read"} className="flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-gray-700 hover:bg-white disabled:opacity-60">
                          {busy === "read" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                          Mark read
                        </button>
                      )}
                      <button type="button" onClick={() => setConfirm("selected")} aria-label={`Delete ${plural(count)}`} className="flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Delete<span className="hidden sm:inline"> selected</span></span>
                      </button>
                      <button type="button" onClick={() => setSelected(new Set())} className="flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-gray-500 hover:bg-white hover:text-gray-800">
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirm("all")} className="flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Delete all
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Content */}
            {!loaded && !error ? (
              <PageLoader size="sm" label="Loading notifications..." />
            ) : !loaded && error ? (
              <div className="px-6 py-10 text-center" role="alert">
                <p className="text-sm font-semibold text-gray-900">Couldn’t load notifications</p>
                <p className="mt-1 text-xs text-gray-500">Check your connection and try again.</p>
                <button type="button" onClick={reload} className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50">Try again</button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-500"><BellOff className="h-5 w-5" aria-hidden="true" /></span>
                <p className="mt-3 text-sm font-semibold text-gray-900">No notifications yet</p>
                <p className="mt-1 text-xs text-gray-500">New updates will appear here.</p>
              </div>
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-gray-100/80 overflow-y-auto overscroll-contain">
                {items.map((item) => {
                  const Icon = ICONS[item.type] || Bell;
                  const isSelected = selected.has(item.id);
                  const deleting = busy === item.id;
                  return (
                    <li key={item.id} className={`flex items-start gap-1 py-1.5 pr-2 pl-2 transition ${isSelected ? "bg-brand-50/70" : item.read ? "" : "bg-brand-50/40"}`}>
                      <Check checked={isSelected} onChange={() => toggleOne(item.id)} label={`Select notification: ${item.title}`} />
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className="flex min-w-0 flex-1 items-start gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-gray-50/80 focus-visible:outline-2 focus-visible:outline-brand-500"
                      >
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.read ? "bg-gray-100 text-gray-500" : "bg-brand-100 text-brand-700"}`}>
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm break-words ${item.read ? "font-medium text-gray-700" : "font-semibold text-gray-900"}`}>
                            {!item.read && <span className="sr-only">Unread: </span>}
                            {item.title}
                          </span>
                          {item.message && <span className="mt-0.5 block text-xs break-words whitespace-pre-line text-gray-500">{item.message}</span>}
                          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-400">
                            {!item.read && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />}
                            {timeAgo(item.createdAt)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteOne(item)}
                        disabled={deleting}
                        aria-label={deleting ? "Deleting notification" : `Delete notification: ${item.title}`}
                        title="Delete"
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:text-red-600 disabled:opacity-60"
                      >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {portalTarget && createPortal(
        <ConfirmDialog
          open={Boolean(confirm)}
          onClose={() => busy !== "selected" && busy !== "all" && setConfirm(null)}
          onConfirm={confirmDelete}
          disabled={busy === "selected" || busy === "all"}
          title={confirm === "all" ? "Delete all notifications?" : `Delete ${plural(count)}?`}
          description={confirm === "all" ? "This will permanently remove all your notifications." : "The selected notifications will be permanently removed."}
          confirmLabel={busy === "selected" || busy === "all" ? "Deleting..." : confirm === "all" ? "Delete all" : "Delete selected"}
        />,
        portalTarget,
      )}
    </div>
  );
};

export default NotificationBell;
