import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";
import { RevealGroup, RevealItem, SectionHeader } from "./LandingMotion";

const DiscoverCategories = () => {
  const { paths } = usePlatform();
  const href = (params) => `${paths.listings}?${new URLSearchParams(params)}`;
  const categories = [
    { label: "Homes for Sale", note: "Browse homes to buy", image: "/hero/heritage-villa-960.jpg", to: href({ status: "Sale" }) },
    { label: "Homes for Rent", note: "Browse available rentals", image: "/hero/furnished-bedroom-960.jpg", to: href({ status: "Rent" }) },
    { label: "Apartments", note: "Explore apartments", image: "/hero/modern-living-960.jpg", to: href({ type: "Apartment" }) },
    { label: "Short Stays", note: "Hotels and hotel apartments", image: "/banners/properties-resort-960.jpg", to: href({ type: "Hotel,Hotel-Apartment" }) },
  ];
  return (
    <section className="home-section home-discover" aria-labelledby="discover-heading">
      <div className="container-page">
        <SectionHeader>
          <div><p className="home-eyebrow">BROWSE BY CATEGORY</p><h2 id="discover-heading" className="home-section-title">What are you looking for?</h2></div>
          <div className="home-section-aside"><p>Choose a category to explore the full catalogue.</p></div>
        </SectionHeader>
        <RevealGroup as="ul" className="home-categories" gap={0.06}>
          {categories.map(({ label, note, image, to }) => (
            <RevealItem as="li" variant="fade" key={label}>
              <Link to={to} className="home-category">
                <img src={image} alt="" loading="lazy" decoding="async" width="480" height="360" />
                <span className="home-category-body"><span className="home-category-label">{label}</span><span className="home-category-note">{note}</span></span>
                <span className="home-category-open" aria-hidden="true"><ArrowUpRight size={18} /></span>
              </Link>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
};

export default DiscoverCategories;
