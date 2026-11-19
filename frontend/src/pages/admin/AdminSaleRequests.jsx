import AdminPageTitle from "../../components/admin/AdminPageTitle";
import TransactionNav from "../../components/offers/TransactionNav";
import SaleRequestsBoard from "../../components/offers/SaleRequestsBoard";

const AdminSaleRequests = () => (
  <>
    <AdminPageTitle title="Sales" description="Purchase requests on admin and agent listings. Buyers pay the owner as agreed; the owner confirms the payment." />
    <TransactionNav scope="admin" />
    <SaleRequestsBoard scope="admin" />
  </>
);

export default AdminSaleRequests;
