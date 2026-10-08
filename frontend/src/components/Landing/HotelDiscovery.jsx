import { Link } from "react-router-dom";
import { ArrowUpRight, BedDouble, CalendarCheck, Sparkles } from "lucide-react";
import PropertyRail from "./PropertyRail";
import { usePlatform } from "../../context/usePlatform";

// Hotels list room types, each with its own price and availability, instead of one price
const features = [
  { Icon: BedDouble, title: "Choose your room", text: "Each hotel lists its room types with photos, capacity and a nightly price." },
  { Icon: Sparkles, title: "Compare amenities", text: "See what every room includes before you decide." },
  { Icon: CalendarCheck, title: "Check dates and book", text: "Pick check-in and check-out, see availability, then book through HomeBase." },
];

const HotelDiscovery = ({ items, loading }) => {
  const { paths } = usePlatform();
  return (
    <section className="home-section home-hotels" aria-labelledby="hotels-heading">
      <div className="container-page">
        <div className="home-section-header">
          <div><p className="home-eyebrow">06 / HOTELS & STAYS</p><h2 id="hotels-heading" className="home-section-title">Find your <span className="home-serif">next stay.</span></h2></div>
          <div className="home-section-aside"><p>Discover hotels and choose the room that suits you.<br />Compare room types, amenities, prices and availability.</p><Link to={`${paths.listings}?type=Hotel`} className="home-text-link">Explore hotels <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        </div>
        <ul className="home-hotel-features">{features.map(({ Icon, title, text }) => (
          <li key={title}><Icon size={22} strokeWidth={1.6} aria-hidden="true" /><div><h3>{title}</h3><p>{text}</p></div></li>
        ))}</ul>
        {!loading && !items.length ? (
          <div className="home-listings-message"><h3>Hotels are coming to HomeBase.</h3><p>Hotel agents can already list their rooms — check back soon to book a stay.</p></div>
        ) : <PropertyRail items={items} loading={loading} count={3} columns={3} label="Hotels" />}
      </div>
    </section>
  );
};

export default HotelDiscovery;
