import AdminPageTitle from "../../components/admin/AdminPageTitle";
import TransactionNav from "../../components/offers/TransactionNav";
import OffersBoard from "../../components/offers/OffersBoard";

const AdminOffers = () => (
  <>
    <AdminPageTitle title="Offers" description="Every offer on the platform, on admin and agent listings." />
    <TransactionNav scope="admin" />
    <OffersBoard scope="admin" />
  </>
);

export default AdminOffers;
