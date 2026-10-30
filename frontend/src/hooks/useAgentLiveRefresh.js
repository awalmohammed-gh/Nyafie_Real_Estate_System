import { useEffect } from "react";
import { useRealEstate } from "../context/useRealEstate";

const REFRESH_MS = 60000; // same cadence as the admin console

/**
 * Keeps the agent workspace's listings (with their live view counts) current: reloaded in the
 * background every minute while the tab is visible, and as soon as the agent comes back to the tab.
 */
export const useAgentLiveRefresh = () => {
  const { refreshListings } = useRealEstate();

  useEffect(() => {
    let running = false;
    const refresh = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      await refreshListings().catch(() => {});
      running = false;
    };
    const timer = setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshListings]);
};
