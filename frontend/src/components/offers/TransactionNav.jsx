import SubNav from "../dashboard/SubNav";
import { useTransactions } from "../../context/useTransactions";

// Offers / Rentals / Sales (/ Payments) as one area, with what's waiting on each
const TransactionNav = ({ scope }) => {
  const { pending } = useTransactions();
  const base = `/${scope}`;
  const items = [
    { label: "Offers", to: `${base}/offers`, count: pending.offers },
    { label: scope === "admin" ? "Rentals" : "Rental requests", to: `${base}/rentals`, count: pending.rentals },
    { label: scope === "admin" ? "Sales" : "Sale requests", to: `${base}/sale-requests`, count: pending.sales },
  ];
  if (scope === "admin") items.push({ label: "Payments", to: "/admin/payments" });
  return <SubNav items={items} label="Transactions" />;
};

export default TransactionNav;
