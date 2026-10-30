import { useEffect, useEffectEvent, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useLockBodyScroll } from "../../hooks/useLockBodyScroll";

const sizes = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

// Accessible dialog: bottom sheet on phones, centered card on larger screens
const ModalPanel = ({ onClose, title, description, size, children, footer, centered }) => {
  useLockBodyScroll(true);
  const onEscape = useEffectEvent(() => onClose());
  const panel = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    const focusable = () => [...(panel.current?.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]') || [])].filter((element) => !element.disabled && element.getClientRects().length);
    focusable()[0]?.focus();
    const handleKey = (e) => {
      const dialogs = document.querySelectorAll('[role="dialog"], dialog[open]');
      if (dialogs[dialogs.length - 1] !== panel.current) return;
      if (e.key === "Escape") { e.preventDefault(); onEscape(); }
      if (e.key === "Tab") {
        const items = focusable(), first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => { window.removeEventListener("keydown", handleKey); if (previous?.isConnected) previous.focus(); };
  }, []);

  return (
    <div className={`fixed inset-0 z-[70] flex justify-center ${centered ? "items-center p-3 sm:p-5" : "items-end sm:items-center sm:p-4"}`}>
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
        ref={panel}
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 32, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 32, scale: 0.98 }}
        transition={{ type: "spring", damping: 32, stiffness: 400 }}
        className={`relative flex w-full flex-col overflow-hidden bg-white shadow-2xl in-[.dash]:shadow-xl ${centered ? "max-h-[calc(100dvh-1.5rem)] rounded-2xl sm:max-h-[calc(100dvh-2.5rem)]" : "max-h-[92dvh] rounded-t-3xl sm:rounded-3xl in-[.dash]:rounded-t-xl sm:in-[.dash]:rounded-xl"} ${sizes[size]}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-5 sm:px-6 in-[.dash]:py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 in-[.dash]:text-base in-[.dash]:font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-gray-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
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
