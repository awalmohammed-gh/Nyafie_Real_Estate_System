import AdminPageTitle from "../../components/admin/AdminPageTitle";
import TransactionNav from "../../components/offers/TransactionNav";
import ViewingsBoard from "../../components/viewings/ViewingsBoard";

const AdminViewings = () => (
  <>
    <AdminPageTitle title="Viewings" description="Every viewing booked on the platform, on admin and agent listings." />
    <TransactionNav scope="admin" />
    <ViewingsBoard scope="admin" />
  </>
);

export default AdminViewings;
