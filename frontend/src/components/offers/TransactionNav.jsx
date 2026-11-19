import SubNav from "../dashboard/SubNav";
import { useTransactions } from "../../context/useTransactions";
import { adminPath } from "../../utils/adminEntry";

// Offers / Rentals / Sales / Viewings (/ Payments) as one area, with what's waiting on each
const TransactionNav = ({ scope }) => {
  const { pending } = useTransactions();
  const base = `/${scope}`;
  const items = [
    { label: "Offers", to: `${base}/offers`, count: pending.offers },
    { label: scope === "admin" ? "Rentals" : "Rental requests", to: `${base}/rentals`, count: pending.rentals },
    { label: scope === "admin" ? "Sales" : "Sale requests", to: `${base}/sale-requests`, count: pending.sales },
    { label: "Viewings", to: `${base}/viewings`, count: pending.viewings },
  ];
  if (scope === "admin") items.push({ label: "Payments", to: adminPath("/payments") });
  return <SubNav items={items} label="Transactions" />;
};

export default TransactionNav;
