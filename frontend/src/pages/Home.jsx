import Hero from "../components/Landing/Hero";
import DiscoverCategories from "../components/Landing/DiscoverCategories";
import FeatureListings from "../components/Landing/FeatureListings";
import PromoSection from "../components/Landing/PromoSection";
import HowItWorks from "../components/Landing/HowItWorks";
import SpotlightBanner from "../components/Landing/SpotlightBanner";
import HotelDiscovery from "../components/Landing/HotelDiscovery";
import BecomeAgent from "../components/Landing/BecomeAgent";
import Neighbourhoods from "../components/Landing/Neighbourhoods";
import HomeAgents from "../components/Landing/HomeAgents";
import RecentListings from "../components/Landing/RecentListings";
import WhyHomeBase from "../components/Landing/WhyHomeBase";
import FinalCta from "../components/Landing/FinalCta";
import { useHomeListings } from "../hooks/useHomeListings";
import { usePropertyFacets } from "../hooks/usePropertyFacets";
import { usePlatform } from "../context/usePlatform";
import "../components/Landing/home.css";

const Home = () => {
  const { paths } = usePlatform();
  const listings = useHomeListings();
  const facets = usePropertyFacets();

  return (
    <div className="home-page">
      <Hero />
      <DiscoverCategories />
      <FeatureListings query={listings.featuredQuery} items={listings.featured} />
      <PromoSection
        id="rent" eyebrow="03 / PROPERTIES FOR RENT" title="Looking for a place" accent="to rent?"
        description="Discover apartments, houses and other properties available for rent in locations that suit your lifestyle."
        points={["Monthly rentals and furnished short stays", "Request a rental and pay securely online", "Talk to the agent before you commit"]}
        cta="Explore properties for rent" to={`${paths.listings}?purpose=rent`} count={facets.data?.rent}
        items={listings.rentals} loading={listings.loading} emptyText="No rentals are listed right now — new ones are added regularly."
      />
      <HowItWorks />
      <PromoSection
        id="sale" eyebrow="05 / PROPERTIES FOR SALE" title="Ready to own" accent="a property?" tone="is-tinted" reverse
        description="Explore homes and properties available for sale and connect directly with trusted agents."
        points={["Make an offer or request to buy online", "See the full details, photos and location", "Deal directly with the listing agent"]}
        cta="Browse properties for sale" to={`${paths.listings}?purpose=sale`} count={facets.data?.sale}
        items={listings.sales} loading={listings.loading} emptyText="No properties are for sale right now — check back soon."
      />
      <SpotlightBanner />
      <HotelDiscovery items={listings.hotels} loading={listings.loading} />
      <BecomeAgent />
      <Neighbourhoods />
      <HomeAgents />
      <RecentListings items={listings.recent} loading={listings.loading} />
      <WhyHomeBase />
      <FinalCta />
    </div>
  );
};

export default Home;
