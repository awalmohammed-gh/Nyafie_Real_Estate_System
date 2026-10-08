import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MoreHorizontal } from "lucide-react";

// Row actions menu. Uses fixed positioning so it is never clipped by a
// horizontally scrolling table.
const ActionMenu = ({ actions, label = "Actions" }) => {
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const visible = actions.filter((a) => !a.hidden);

  const menuHeight = visible.length * 36 + 10;
  const measure = () => {
    const rect = buttonRef.current.getBoundingClientRect();
    const openUp = rect.bottom + menuHeight > window.innerHeight - 8;
    return {
      top: openUp ? Math.max(8, rect.top - menuHeight - 6) : rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
      offscreen: rect.bottom < 0 || rect.top > window.innerHeight,
    };
  };

  const toggle = () => setPosition((current) => (current ? null : measure()));
  const isOpen = Boolean(position);

  useEffect(() => {
    if (!isOpen) return;
    const close = (e) => {
      if (e.type === "keydown" && e.key !== "Escape") return;
      if (e.type === "pointerdown" && (menuRef.current?.contains(e.target) || buttonRef.current?.contains(e.target))) return;
      setPosition(null);
    };
    // Follow the button while the page or table scrolls; close once it leaves the screen
    const follow = () => {
      if (!buttonRef.current) return setPosition(null);
      const next = measure();
      setPosition(next.offscreen ? null : next);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
    // measure only reads refs and the static menu height
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`grid h-8 w-8 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 ${position ? "bg-gray-100 text-gray-900" : ""}`}
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      <AnimatePresence>
        {position && (
          <motion.div
            ref={menuRef}
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            style={{ top: position.top, right: position.right }}
            className="fixed z-[80] w-56 origin-top-right rounded-lg border border-gray-200 bg-white p-1 shadow-lg shadow-gray-900/5"
          >
            {visible.map((action) => (
              <button
                key={action.label}
                role="menuitem"
                disabled={action.disabled}
                title={action.disabled ? action.disabledReason : undefined}
                onClick={() => {
                  setPosition(null);
                  action.onClick();
                }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  action.danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {action.icon && <action.icon className="h-4 w-4 shrink-0" />}
                {action.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ActionMenu;
