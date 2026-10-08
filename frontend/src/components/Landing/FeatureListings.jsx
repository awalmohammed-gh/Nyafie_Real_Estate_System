import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import HouseCard from "../card/HouseCard";
import SkeletonGrid from "../ui/SkeletonGrid";
import { usePlatform } from "../../context/usePlatform";

const FeatureListings = ({ featured }) => {
  const { paths } = usePlatform();
  const homes = (featured.data?.items || []).slice(0, 3);

  return (
    <section id="home-listings" className="home-section home-featured" aria-labelledby="featured-heading">
      <div className="container-page">
        <div className="home-section-header">
          <div><p className="home-eyebrow">01 / THE SHORTLIST</p><h2 id="featured-heading" className="home-section-title">Worth a <span className="home-serif">closer look.</span></h2></div>
          <div className="home-section-aside"><p>A few places to picture your life in.<br />Find the one that feels right.</p><Link to={paths.listings} className="home-text-link">Explore all homes <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        </div>
        {featured.loading ? <SkeletonGrid count={3} /> : featured.error ? (
          <div role="alert" className="home-listings-message"><h3>We couldn’t load the homes.</h3><p>Please try again in a moment.</p><button type="button" onClick={featured.reload} className="btn btn-primary mt-4">Try again</button></div>
        ) : homes.length === 0 ? (
          <div className="home-listings-message"><h3>New beginnings are on their way.</h3><p>Explore the listings page for available homes.</p><Link to={paths.listings} className="home-text-link mt-4">Browse listings <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        ) : (
          <div className="home-listings-grid">{homes.map((house) => <HouseCard key={house.id} house={house} />)}</div>
        )}
        <div className="home-featured-footnote"><span>Different spaces. One next chapter.</span><span>Buy it. Rent it. Make it yours.</span></div>
      </div>
    </section>
  );
};

export default FeatureListings;
