import { Link } from "react-router-dom";
import { Building2, Hotel, House, KeyRound, Layers3 } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";
import { cloudImage } from "../../utils/cloudImage";
import { countOf, landTypes } from "../../utils/homeRows";
import { shortStayPath } from "../../utils/shortStay";
import { RevealBlock, RevealGroup, RevealItem } from "./LandingMotion";

// Only categories with something in them, with how many (from the same listings the links open)
const DiscoverCategories = ({ facets }) => {
  const { paths } = usePlatform();
  if (!facets) return null;
  const href = (params) => `${paths.listings}?${new URLSearchParams(params)}`;
  const land = landTypes(facets.types);
  const categories = [
    { label: "Homes for Sale", count: facets.sale, Icon: House, image: "/hero/nyafie-modern-villa-960.jpg", to: href({ status: "Sale" }) },
    { label: "Homes for Rent", count: facets.rent, Icon: KeyRound, image: "/hero/modern-living-960.jpg", to: href({ status: "Rent" }) },
    { label: "Apartments", count: countOf(facets.types, /^apartment$/i), Icon: Building2, image: "/properties/house9.jpg", to: href({ type: "Apartment" }) },
    { label: "Short Stays", count: facets.stays, Icon: Hotel, image: "/banners/properties-resort-960.jpg", to: shortStayPath(paths.listings) },
    { label: "Land & Plots", count: land.reduce((sum, type) => sum + type.count, 0), Icon: Layers3, image: "/banners/nyafie-land.jpg", to: href({ type: land.map((type) => type.value).join(",") }) },
  ].filter(({ count }) => count > 0);
  if (categories.length < 2) return null;
  return (
    <section className="home-section home-discover" aria-labelledby="discover-heading">
      <div className="container-page">
        <RevealBlock as="header" className="home-section-header"><div><h2 id="discover-heading" className="home-section-title">What are you looking for?</h2><p className="home-section-description">Find properties that match your plans.</p></div></RevealBlock>
        <RevealGroup as="ul" className="home-categories" style={{ "--home-categories": categories.length }} gap={0.08}>{categories.map(({ label, count, Icon, image, to }) => (
          <RevealItem as="li" variant="rise" key={label}><Link to={to} className="home-category">
            <span className="home-category-image"><img src={cloudImage(image, 320)} alt="" loading="lazy" decoding="async" width="480" height="300" /><span className="home-category-icon"><Icon size={24} strokeWidth={1.7} aria-hidden="true" /></span></span>
            <span className="home-category-body"><span className="home-category-label">{label}</span><span className="home-category-note">{count.toLocaleString()} {count === 1 ? "listing" : "listings"}</span></span>
          </Link></RevealItem>
        ))}</RevealGroup>
      </div>
    </section>
  );
};
export default DiscoverCategories;
