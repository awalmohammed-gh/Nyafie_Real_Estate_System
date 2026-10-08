import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import PropertyRail from "./PropertyRail";
import { usePlatform } from "../../context/usePlatform";

const RecentListings = ({ items, loading }) => {
  const { paths } = usePlatform();
  if (!loading && !items.length) return null;
  return (
    <section className="home-section home-recent" aria-labelledby="recent-heading">
      <div className="container-page">
        <div className="home-section-header">
          <div><p className="home-eyebrow"><span className="home-live-dot" aria-hidden="true" />RECENTLY ADDED</p><h2 id="recent-heading" className="home-section-title">Just <span className="home-serif">listed.</span></h2></div>
          <div className="home-section-aside"><p>The newest properties on HomeBase.</p><Link to={`${paths.listings}?sort=latest`} className="home-text-link">See more <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        </div>
        <PropertyRail items={items} loading={loading} count={4} columns={4} label="Recently added properties" />
      </div>
    </section>
  );
};

export default RecentListings;
