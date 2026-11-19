import PageTitle from "../../components/agent/PageTitle";
import TransactionNav from "../../components/offers/TransactionNav";
import SaleRequestsBoard from "../../components/offers/SaleRequestsBoard";

const SaleRequests = () => (
  <>
    <PageTitle title="Sale Requests" description="Customers who want to buy your properties. Agree payment with each buyer, then confirm it and complete the sale here." />
    <TransactionNav scope="agent" />
    <SaleRequestsBoard scope="agent" />
  </>
);

export default SaleRequests;
