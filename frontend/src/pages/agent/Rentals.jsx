import PageTitle from "../../components/agent/PageTitle";
import TransactionNav from "../../components/offers/TransactionNav";
import RentalsBoard from "../../components/offers/RentalsBoard";

const Rentals = () => (
  <>
    <PageTitle title="Rental Requests" description="Bookings and online payments for your rental properties." />
    <TransactionNav scope="agent" />
    <RentalsBoard scope="agent" />
  </>
);

export default Rentals;
