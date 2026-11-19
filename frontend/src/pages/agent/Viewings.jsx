import PageTitle from "../../components/agent/PageTitle";
import TransactionNav from "../../components/offers/TransactionNav";
import ViewingsBoard from "../../components/viewings/ViewingsBoard";

const Viewings = () => (
  <>
    <PageTitle title="Viewings" description="Times customers booked to see your listings. Confirm them, or suggest a time that suits you." />
    <TransactionNav scope="agent" />
    <ViewingsBoard scope="agent" />
  </>
);

export default Viewings;
