import { Link } from "react-router-dom";
import { Building2, Hotel, House, KeyRound, Layers3 } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";

const DiscoverCategories = () => {
  const { paths } = usePlatform();
  const href = (params) => `${paths.listings}?${new URLSearchParams(params)}`;
  const categories = [
    { label: "Homes for Sale", note: "Buy your next home", Icon: House, image: "/banners/listings-suburb-960.jpg", to: href({ status: "Sale" }) },
    { label: "Homes for Rent", note: "Find a place to live", Icon: KeyRound, image: "/hero/furnished-bedroom-960.jpg", to: href({ status: "Rent" }) },
    { label: "Apartments", note: "Modern and convenient", Icon: Building2, image: "/hero/modern-living-960.jpg", to: href({ type: "Apartment" }) },
    { label: "Short Stays", note: "Perfect for travel or business", Icon: Hotel, image: "/banners/properties-resort-960.jpg", to: href({ type: "Hotel,Hotel-Apartment" }) },
    { label: "Land & Plots", note: "Explore available land", Icon: Layers3, image: "/banners/nyafie-land.jpg", to: href({ type: "Land,Plot,Land-and-Plots" }) },
  ];
  return (
    <section className="home-section home-discover" aria-labelledby="discover-heading">
      <div className="container-page">
        <header className="home-section-header"><div><p className="home-eyebrow">BROWSE BY CATEGORY</p><h2 id="discover-heading" className="home-section-title">What are you looking for?</h2><p className="home-section-description">Find properties that match your plans &mdash; buy, rent, stay or invest.</p></div></header>
        <ul className="home-categories">{categories.map(({ label, note, Icon, image, to }) => (
          <li key={label}><Link to={to} className="home-category">
            <span className="home-category-image"><img src={image} alt="" loading="lazy" decoding="async" width="480" height="300" /><span className="home-category-icon"><Icon size={24} strokeWidth={1.7} aria-hidden="true" /></span></span>
            <span className="home-category-body"><span className="home-category-label">{label}</span><span className="home-category-note">{note}</span></span>
          </Link></li>
        ))}</ul>
      </div>
    </section>
  );
};
export default DiscoverCategories;
