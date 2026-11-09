import Hero from "../components/Landing/Hero";
import TrustBar from "../components/Landing/TrustBar";
import FeatureListings from "../components/Landing/FeatureListings";
import DiscoverCategories from "../components/Landing/DiscoverCategories";
import HowItWorks from "../components/Landing/HowItWorks";
import BecomeAgent from "../components/Landing/BecomeAgent";
import FinalCta from "../components/Landing/FinalCta";
import "../components/Landing/home.css";

const Home = () => (
  <div className="home-page home-reference">
    <Hero />
    <TrustBar />
    <FeatureListings />
    <DiscoverCategories />
    <HowItWorks />
    <BecomeAgent />
    <FinalCta />
  </div>
);

export default Home;
