import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useTransactions } from "../context/useTransactions";

const FIELDS = ["pendingApplications", "openReports", "pendingDocumentChecks", "pendingListings", "newInquiries"];

/**
 * Admin sidebar badges, from the same counts request as the transaction badges (TransactionsProvider):
 * refreshed every minute while the tab is visible, on every page change and after ADMIN_COUNTS_CHANGED.
 */
export const useAdminCounts = () => {
  const { counts, reloadCounts } = useTransactions();
  const { pathname } = useLocation();
  const shown = useRef(pathname);

  useEffect(() => {
    if (shown.current === pathname) return; // the first load is the provider's
    shown.current = pathname;
    reloadCounts();
  }, [pathname, reloadCounts]);

  return Object.fromEntries(FIELDS.map((field) => [field, counts[field] || 0]));
};
