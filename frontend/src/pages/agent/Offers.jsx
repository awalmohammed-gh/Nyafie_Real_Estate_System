import PageTitle from "../../components/agent/PageTitle";
import TransactionNav from "../../components/offers/TransactionNav";
import OffersBoard from "../../components/offers/OffersBoard";

const Offers = () => (
  <>
    <PageTitle title="Offers" description="Price offers customers made on your listings, for sale or rent." />
    <TransactionNav scope="agent" />
    <OffersBoard scope="agent" />
  </>
);

export default Offers;
