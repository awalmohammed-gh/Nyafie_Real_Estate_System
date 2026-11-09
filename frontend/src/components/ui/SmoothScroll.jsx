import { useEffect } from "react";
import { useReducedMotion } from "motion/react";
import "lenis/dist/lenis.css";

// Smooth the public page's wheel scrolling; touch and nested panels stay native.
const SmoothScroll = () => {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let active = true;
    let scroll;
    import("lenis").then(({ default: Lenis }) => {
      if (!active) return;
      scroll = new Lenis({
        autoRaf: true,
        autoToggle: true,
        smoothWheel: true,
        syncTouch: false,
        lerp: 0.12,
        allowNestedScroll: true,
        anchors: { offset: -96 },
        stopInertiaOnNavigate: true,
        prevent: (node) => node.classList?.contains("leaflet-container"),
      });
    });
    return () => { active = false; scroll?.destroy(); };
  }, [reducedMotion]);

  return null;
};

export default SmoothScroll;
