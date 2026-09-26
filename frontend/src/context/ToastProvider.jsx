import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { ToastContext } from "./toastContext";

const styles = {
  success: { icon: CheckCircle2, color: "text-emerald-500" },
  error: { icon: XCircle, color: "text-red-500" },
  warning: { icon: AlertTriangle, color: "text-amber-500" },
  info: { icon: Info, color: "text-brand-500" },
};

let nextId = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    ({ title, description, type = "success", duration = 4000 }) => {
      const id = ++nextId;
      setToasts((prev) => [...prev.slice(-2), { id, title, description, type }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:top-auto sm:right-6 sm:bottom-6 sm:left-auto sm:items-end"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const { icon: Icon, color } = styles[t.type] || styles.info;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                transition={{ type: "spring", damping: 28, stiffness: 400 }}
                role="status"
                className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl bg-white p-4 shadow-2xl ring-1 shadow-gray-900/10 ring-gray-100"
              >
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${color}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-sm text-gray-500">{t.description}</p>}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
