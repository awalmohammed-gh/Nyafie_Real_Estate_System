import { useContext, useEffect, useId, useRef } from "react";
import { ScrimContext } from "../context/scrimContext";

/**
 * Shows the shared page scrim (soft blur behind the navigation) while `open` is true.
 * Any dropdown inside a <ScrimProvider> can use it: `useScrim(open, close)`.
 * Clicking the scrim calls `onClose`. Outside a provider (e.g. the dashboards) it does nothing.
 */
export const useScrim = (open, onClose) => {
  const scrim = useContext(ScrimContext);
  const id = useId();
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!scrim || !open) return undefined;
    return scrim.register(id, () => closeRef.current?.());
  }, [scrim, open, id]);
};
