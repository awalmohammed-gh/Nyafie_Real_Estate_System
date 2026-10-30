import { useEffect } from "react";

let activeLocks = 0;
let originalOverflow = "";

// Stops the page behind a modal or drawer from scrolling while it is open.
// The lock goes on <html>, the page's scroller: html has overflow-x: clip (see index.css),
// so overflow set on <body> would no longer reach the viewport.
export const useLockBodyScroll = (active) => {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    if (activeLocks === 0) originalOverflow = root.style.overflow;
    activeLocks += 1;
    root.style.overflow = "hidden";
    return () => {
      activeLocks -= 1;
      if (activeLocks === 0) root.style.overflow = originalOverflow;
    };
  }, [active]);
};
