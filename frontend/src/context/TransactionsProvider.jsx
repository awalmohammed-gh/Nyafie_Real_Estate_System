import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApi, agentApi } from "../frontApi";
import { TransactionsContext } from "./transactionsContext";
import { ADMIN_COUNTS_CHANGED } from "../utils/adminCounts";
import { startPolling } from "../utils/poll";

const POLL_MS = 60000;
const COUNTS = { admin: adminApi.getAdminCounts, agent: agentApi.getAgentCounts };
const NOTHING_PENDING = { offers: 0, rentals: 0, sales: 0, officePayments: 0, viewings: 0 };

/**
 * The dashboard's badge counts, from one small request refreshed every minute while the tab is visible.
 * The lists behind them load on their own pages (usePagedList); pages call reloadCounts() after a change.
 */
export const TransactionsProvider = ({ scope, children }) => {
  const [counts, setCounts] = useState({});
  const reloadCounts = useCallback(() => COUNTS[scope]().then(setCounts, () => {}), [scope]);

  useEffect(() => {
    reloadCounts();
    window.addEventListener(ADMIN_COUNTS_CHANGED, reloadCounts);
    const stopPolling = startPolling(reloadCounts, POLL_MS);
    return () => {
      stopPolling();
      window.removeEventListener(ADMIN_COUNTS_CHANGED, reloadCounts);
    };
  }, [reloadCounts]);

  // pending: what needs a response from the owner side
  const value = useMemo(() => ({ counts, pending: counts.work || NOTHING_PENDING, reloadCounts }), [counts, reloadCounts]);
  return <TransactionsContext.Provider value={value}>{children}</TransactionsContext.Provider>;
};
