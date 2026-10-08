import { useEffect } from "react";

// Stops the page behind a modal or drawer from scrolling while it is open.
// The lock goes on <html>, the page's scroller: html has overflow-x: clip (see index.css),
// so overflow set on <body> would no longer reach the viewport.
export const useLockBodyScroll = (active) => {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [active]);
};
