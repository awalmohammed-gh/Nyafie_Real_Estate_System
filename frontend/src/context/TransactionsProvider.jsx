import { useCallback, useEffect, useMemo, useState } from "react";
import { offerApi, rentalApi, saleRequestApi, viewingApi } from "../frontApi";
import { TransactionsContext } from "./transactionsContext";

const POLL_MS = 60000;

const LOADERS = {
  admin: [offerApi.getAdminOffers, rentalApi.getAdminRentals, saleRequestApi.getAdminSaleRequests, viewingApi.getAdminViewings],
  agent: [offerApi.getAgentOffers, rentalApi.getAgentRentals, saleRequestApi.getAgentSaleRequests, viewingApi.getAgentViewings],
};

/**
 * Loads the dashboard's transactions once and refreshes them every minute.
 * Dashboard summaries, attention counts and sidebar badges read from here;
 * management pages call reload() after changing something.
 */
export const TransactionsProvider = ({ scope, children }) => {
  const [data, setData] = useState({ offers: [], rentals: [], sales: [], viewings: [] });
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  const updateTransaction = useCallback((kind, updated) => {
    setData((current) => ({ ...current, [kind]: current[kind].map((item) => item.id === updated.id ? updated : item) }));
  }, []);

  // State only changes in the promise callbacks, after the requests finish
  const reload = useCallback(
    () =>
      Promise.all(LOADERS[scope].map((load) => load())).then(
        ([offers, rentals, sales, viewings]) => {
          setData({ offers, rentals, sales, viewings });
          setStatus("ready");
          setError("");
        },
        (err) => {
          setError(err.message);
          setStatus((current) => (current === "ready" ? "ready" : "error")); // keep showing data we already have
        }
      ),
    [scope]
  );

  useEffect(() => {
    reload();
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const value = useMemo(() => {
    const { offers, rentals, sales, viewings } = data;
    return {
      ...data,
      loading: status === "loading",
      error: status === "error" ? error : "",
      reload,
      updateTransaction,
      // What needs a response from the owner side
      pending: {
        offers: offers.filter((o) => o.status === "Pending").length,
        rentals: rentals.filter((r) => r.statusKey === "paid").length, // paid, waiting to be confirmed
        sales: sales.filter((s) => s.statusKey === "pending").length,
        officePayments: sales.filter((s) => s.statusKey === "payment_pending").length,
        viewings: viewings.filter((v) => v.statusKey === "requested" && v.awaiting === "owner").length, // requests to answer
      },
    };
  }, [data, status, error, reload, updateTransaction]);

  return <TransactionsContext.Provider value={value}>{children}</TransactionsContext.Provider>;
};
