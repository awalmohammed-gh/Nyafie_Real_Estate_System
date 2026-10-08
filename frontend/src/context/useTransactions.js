import { useContext } from "react";
import { TransactionsContext } from "./transactionsContext";

// Offers, rentals and sale requests for the current dashboard (agent: own listings; admin: all)
export const useTransactions = () => {
  const context = useContext(TransactionsContext);
  if (!context) throw new Error("useTransactions must be used inside a TransactionsProvider");
  return context;
};
