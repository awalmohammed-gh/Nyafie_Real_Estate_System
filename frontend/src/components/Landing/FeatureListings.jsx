import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import PropertyRail from "./PropertyRail";
import { usePlatform } from "../../context/usePlatform";
import { SectionHeader } from "./LandingMotion";

const FeatureListings = ({ query, items }) => {
  const { paths } = usePlatform();

  return (
    <section id="home-listings" className="home-section home-featured" aria-labelledby="featured-heading">
      <div className="container-page">
        <SectionHeader>
          <div><p className="home-eyebrow">02 / FEATURED PROPERTIES</p><h2 id="featured-heading" className="home-section-title">Handpicked places <span className="home-serif">worth exploring.</span></h2></div>
          <div className="home-section-aside"><p>Featured listings and visitor favourites.<br />Save the ones you like to your wishlist.</p><Link to={paths.listings} className="home-text-link">View all properties <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        </SectionHeader>
        {query.error ? (
          <div role="alert" className="home-listings-message"><h3>We couldn’t load the properties.</h3><p>Please try again in a moment.</p><button type="button" onClick={query.reload} className="btn btn-primary mt-4">Try again</button></div>
        ) : !query.loading && items.length === 0 ? (
          <div className="home-listings-message"><h3>New listings are on their way.</h3><p>Agents are adding properties — check the listings page for what’s available now.</p><Link to={paths.listings} className="home-text-link mt-4">Browse listings <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        ) : (
          <PropertyRail items={items} loading={query.loading} count={4} columns={4} label="Featured properties" />
        )}
      </div>
    </section>
  );
};

export default FeatureListings;
