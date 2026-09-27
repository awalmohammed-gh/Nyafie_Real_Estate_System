import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Building, CheckCheck, ClipboardCheck, CreditCard, HandCoins, KeyRound, MessageCircle, RefreshCw, UserPlus } from "lucide-react";
import { notificationApi } from "../../frontApi";
import { timeAgo } from "../../utils/date";

const POLL_MS = 30000;
const ICONS = { message: MessageCircle, offer: HandCoins, rental: KeyRound, sale: Building, payment: CreditCard, status: RefreshCw, user: UserPlus, review: ClipboardCheck };

// In-app notifications for the signed-in account (customers, agents and admins)
// onDark: white icon for the transparent navbar over a hero
const NotificationBell = ({ className = "", onDark = false }) => {
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const load = useCallback(() => notificationApi.getNotifications().then(setData).catch(() => {}), []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (e) => !containerRef.current?.contains(e.target) && setOpen(false);
    const handleKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) load();
    setOpen((prev) => !prev);
  };

  const openItem = (item) => {
    setOpen(false);
    if (!item.read) {
      setData((d) => ({ items: d.items.map((n) => (n.id === item.id ? { ...n, read: true } : n)), unread: Math.max(0, d.unread - 1) }));
      notificationApi.markNotificationRead(item.id).catch(() => {});
    }
    if (item.link) navigate(item.link);
  };

  const readAll = () => {
    setData((d) => ({ items: d.items.map((n) => ({ ...n, read: true })), unread: 0 }));
    notificationApi.markAllNotificationsRead().catch(() => {});
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={data.unread ? `${data.unread} unread notifications` : "Notifications"}
        className={`relative grid h-10 w-10 place-items-center rounded-full transition ${
          onDark ? `text-white/90 hover:bg-white/10 hover:text-white ${open ? "bg-white/15" : ""}` : `text-gray-600 hover:bg-gray-100 hover:text-gray-900 ${open ? "bg-gray-100" : ""}`
        }`}
      >
        <Bell className="h-5 w-5" />
        {data.unread > 0 && (
          <span className={`absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ${onDark ? "ring-transparent" : "ring-white"}`}>
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute top-full right-0 z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 shadow-gray-900/10 ring-gray-100"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="font-semibold text-gray-900">Notifications</p>
              {data.unread > 0 && (
                <button onClick={readAll} className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800">
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
            </div>
            {data.items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-500">You're all caught up.</p>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {data.items.map((item) => {
                  const Icon = ICONS[item.type] || Bell;
                  return (
                    <li key={item.id}>
                      <button
                        role="menuitem"
                        onClick={() => openItem(item)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-gray-50 ${item.read ? "" : "bg-brand-50/50"}`}
                      >
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.read ? "bg-gray-100 text-gray-500" : "bg-brand-100 text-brand-700"}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${item.read ? "font-medium text-gray-700" : "font-semibold text-gray-900"}`}>{item.title}</span>
                          {item.message && <span className="line-clamp-2 block text-xs text-gray-500">{item.message}</span>}
                          <span className="mt-0.5 block text-[11px] text-gray-400">{timeAgo(item.createdAt)}</span>
                        </span>
                        {!item.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
