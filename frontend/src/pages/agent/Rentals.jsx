import PageTitle from "../../components/agent/PageTitle";
import TransactionNav from "../../components/offers/TransactionNav";
import RentalsBoard from "../../components/offers/RentalsBoard";

const Rentals = () => (
  <>
    <PageTitle title="Rentals & Hotel Bookings" description="Manage rental requests, room bookings, payments and upcoming check-ins." />
    <TransactionNav scope="agent" />
    <RentalsBoard scope="agent" />
  </>
);

export default Rentals;
