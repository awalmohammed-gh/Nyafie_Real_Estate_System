import { useEffect, useEffectEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useLockBodyScroll } from "../../hooks/useLockBodyScroll";

// Sidebar-style dialog that slides in from the right (full width on phones)
const Panel = ({ onClose, title, description, children, footer }) => {
  useLockBodyScroll(true);
  const onEscape = useEffectEvent(() => onClose());
  useEffect(() => {
    const handleKey = (e) => e.key === "Escape" && onEscape();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="fixed inset-0 z-[70]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-gray-950/50 backdrop-blur-sm" />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 34, stiffness: 340 }}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-lg"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-gray-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap gap-2 border-t border-gray-100 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </motion.aside>
    </div>
  );
};

const SidePanel = ({ open, ...props }) => <AnimatePresence>{open && <Panel {...props} />}</AnimatePresence>;

export default SidePanel;
