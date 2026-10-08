import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { adminApi } from "../frontApi";

const POLL_MS = 60000;

// Agent applications waiting for an admin decision (admin sidebar badge).
// Refreshes on every page change too, so approving one updates the badge straight away.
export const usePendingApplications = () => {
  const [count, setCount] = useState(0);
  const { pathname } = useLocation();

  useEffect(() => {
    let active = true;
    const load = () => adminApi.getAdminCounts().then((data) => active && setCount(data.pendingApplications || 0)).catch(() => {});
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pathname]);

  return count;
};
