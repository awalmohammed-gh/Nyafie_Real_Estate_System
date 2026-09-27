import { useEffect, useEffectEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useLockBodyScroll } from "../../hooks/useLockBodyScroll";

const sizes = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

// Accessible dialog: bottom sheet on phones, centered card on larger screens
const ModalPanel = ({ onClose, title, description, size, children, footer }) => {
  useLockBodyScroll(true);
  const onEscape = useEffectEvent(() => onClose());

  useEffect(() => {
    const handleKey = (e) => e.key === "Escape" && onEscape();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="absolute inset-0 bg-gray-950/60 backdrop-blur-sm"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 32, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 32, scale: 0.98 }}
        transition={{ type: "spring", damping: 32, stiffness: 400 }}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl in-[.dash]:rounded-t-xl in-[.dash]:shadow-xl sm:in-[.dash]:rounded-xl ${sizes[size]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 in-[.dash]:py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 in-[.dash]:text-base in-[.dash]:font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-3 border-t border-gray-100 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
};

const Modal = ({ open, size = "md", ...props }) => (
  <AnimatePresence>{open && <ModalPanel size={size} {...props} />}</AnimatePresence>
);

export default Modal;
