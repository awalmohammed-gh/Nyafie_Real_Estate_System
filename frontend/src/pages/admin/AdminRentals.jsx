import AdminPageTitle from "../../components/admin/AdminPageTitle";
import TransactionNav from "../../components/offers/TransactionNav";
import RentalsBoard from "../../components/offers/RentalsBoard";

const AdminRentals = () => (
  <>
    <AdminPageTitle title="Rentals" description="Every rental booking and its Paystack payment status." />
    <TransactionNav scope="admin" />
    <RentalsBoard scope="admin" />
  </>
);

export default AdminRentals;
