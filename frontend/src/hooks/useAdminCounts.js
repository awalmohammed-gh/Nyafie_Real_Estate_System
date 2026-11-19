import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { adminApi } from "../frontApi";

const POLL_MS = 60000;
// Fired after an admin action changes a count (e.g. reviewing a report), so the badge updates at once
export const ADMIN_COUNTS_CHANGED = "admin-counts-changed";

// Admin sidebar badges: agent applications waiting for a decision, open safety reports and
// ownership documents waiting to be checked.
// Refreshes every minute, on every page change and after ADMIN_COUNTS_CHANGED.
export const useAdminCounts = () => {
  const [counts, setCounts] = useState({ pendingApplications: 0, openReports: 0, pendingDocumentChecks: 0 });
  const { pathname } = useLocation();

  useEffect(() => {
    let active = true;
    const load = () => adminApi.getAdminCounts().then((data) => active && setCounts({ pendingApplications: data.pendingApplications || 0, openReports: data.openReports || 0, pendingDocumentChecks: data.pendingDocumentChecks || 0 })).catch(() => {});
    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener(ADMIN_COUNTS_CHANGED, load);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener(ADMIN_COUNTS_CHANGED, load);
    };
  }, [pathname]);

  return counts;
};
