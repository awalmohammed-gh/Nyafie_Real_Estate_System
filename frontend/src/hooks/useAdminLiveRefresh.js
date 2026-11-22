import { useCallback } from "react";
import { useAuth } from "../context/useAuth";
import { usePlatform } from "../context/usePlatform";
import { useRealEstate } from "../context/useRealEstate";
import { useBackgroundRefresh } from "./useBackgroundRefresh";

/**
 * Keeps the admin console's shared data (accounts and agents, listings, inquiries, payments) current:
 * reloaded in the background every minute while the tab is visible, and as soon as the admin comes
 * back to the tab. Pages keep showing the current data while it reloads.
 */
export const useAdminLiveRefresh = () => {
  const { refreshUsers } = useAuth();
  const { refreshListings, refreshInquiries } = useRealEstate();
  const { refreshPayments } = usePlatform();

  const refresh = useCallback(
    () => Promise.allSettled([refreshUsers(), refreshListings(), refreshInquiries(), refreshPayments()]),
    [refreshUsers, refreshListings, refreshInquiries, refreshPayments]
  );
  useBackgroundRefresh(refresh);
};
