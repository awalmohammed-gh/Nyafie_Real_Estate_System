import { useEffect } from "react";

const REFRESH_MS = 60000; // same cadence as the overview and the sidebar badges

/**
 * Runs `refresh` in the background every minute while the tab is visible, and as soon as the
 * person comes back to the tab. A run never overlaps the one before it, and a failed run is
 * ignored so pages keep showing the current data. Pass a stable function (useCallback).
 */
export const useBackgroundRefresh = (refresh) => {
  useEffect(() => {
    let running = false;
    const run = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      await Promise.resolve().then(refresh).catch(() => {});
      running = false;
    };
    const timer = setInterval(run, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", run);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", run);
    };
  }, [refresh]);
};
