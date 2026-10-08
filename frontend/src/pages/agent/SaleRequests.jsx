import PageTitle from "../../components/agent/PageTitle";
import TransactionNav from "../../components/offers/TransactionNav";
import SaleRequestsBoard from "../../components/offers/SaleRequestsBoard";

const SaleRequests = () => (
  <>
    <PageTitle title="Sale Requests" description="Customers who want to buy your properties. Confirm office payments and complete sales here." />
    <TransactionNav scope="agent" />
    <SaleRequestsBoard scope="agent" />
  </>
);

export default SaleRequests;
