import { useEffect } from "react";
import { useAuth } from "../context/useAuth";
import { usePlatform } from "../context/usePlatform";
import { useRealEstate } from "../context/useRealEstate";

const REFRESH_MS = 60000; // same cadence as the overview and the sidebar badges

/**
 * Keeps the admin console's shared data (accounts and agents, listings, inquiries, payments) current:
 * reloaded in the background every minute while the tab is visible, and as soon as the admin comes
 * back to the tab. Pages keep showing the current data while it reloads.
 */
export const useAdminLiveRefresh = () => {
  const { refreshUsers } = useAuth();
  const { refreshListings, refreshInquiries } = useRealEstate();
  const { refreshPayments } = usePlatform();

  useEffect(() => {
    let running = false;
    const refresh = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      await Promise.allSettled([refreshUsers(), refreshListings(), refreshInquiries(), refreshPayments()]);
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
  }, [refreshUsers, refreshListings, refreshInquiries, refreshPayments]);
};
