import { useEffect, useEffectEvent, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useLockBodyScroll } from "../../hooks/useLockBodyScroll";

// Sidebar-style dialog that slides in from the right (full width on phones)
const Panel = ({ onClose, title, description, children, footer, size }) => {
  const panelRef = useRef(null);
  useLockBodyScroll(true);
  const onEscape = useEffectEvent(() => onClose());
  useEffect(() => {
    const previous = document.activeElement;
    const selector = 'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]';
    panelRef.current?.querySelector(selector)?.focus();
    const handleKey = (e) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== panelRef.current) return;
      if (e.key === "Escape") onEscape();
      if (e.key === "Tab") {
        const controls = [...panelRef.current.querySelectorAll(selector)].filter((el) => el.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => { window.removeEventListener("keydown", handleKey); if (previous?.isConnected) previous.focus(); };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-gray-950/40" />
      <motion.aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 34, stiffness: 340 }}
        className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-gray-200 bg-white shadow-xl ${size === "lg" ? "sm:max-w-2xl" : "sm:max-w-xl"}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </motion.aside>
    </div>
  );
};

const SidePanel = ({ open, ...props }) => <AnimatePresence>{open && <Panel {...props} />}</AnimatePresence>;

export default SidePanel;
