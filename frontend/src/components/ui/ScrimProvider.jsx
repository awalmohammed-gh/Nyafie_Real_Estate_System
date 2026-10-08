import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ScrimContext } from "../../context/scrimContext";

/**
 * One page scrim shared by every floating menu inside this provider (mega menu, dropdowns,
 * account and notification menus). While any of them is open, the page behind the navigation
 * is softly blurred and dimmed; the navigation (z-50) and its open panels stay sharp above it.
 * Menus join with useScrim(open, close). Clicking the scrim closes them all.
 */
const ScrimProvider = ({ children }) => {
  const [layers, setLayers] = useState(() => new Map()); // id -> close()

  const register = useCallback((id, close) => {
    setLayers((current) => new Map(current).set(id, close));
    return () =>
      setLayers((current) => {
        const next = new Map(current);
        next.delete(id);
        return next;
      });
  }, []);

  const value = useMemo(() => ({ register }), [register]);
  const closeAll = () => layers.forEach((close) => close());

  return (
    <ScrimContext.Provider value={value}>
      {children}
      {createPortal(
        <AnimatePresence>
          {layers.size > 0 && (
            <motion.div
              key="page-scrim"
              aria-hidden="true"
              data-page-scrim=""
              onClick={closeAll}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              // Stops catching clicks as soon as it starts fading out
              exit={{ opacity: 0, pointerEvents: "none" }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="scrim fixed inset-0 z-40"
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </ScrimContext.Provider>
  );
};

export default ScrimProvider;
