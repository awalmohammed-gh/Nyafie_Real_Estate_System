import { useEffect } from "react";

// Stops the page behind a modal or drawer from scrolling while it is open
export const useLockBodyScroll = (active) => {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
};
