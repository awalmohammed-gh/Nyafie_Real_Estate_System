import FeatureListings from "../components/Landing/FeatureListings";
import Hero from "../components/Landing/Hero";
import Neighbourhoods from "../components/Landing/Neighbourhoods";
import HomeJourney from "../components/Landing/HomeJourney";
import { propertyApi } from "../frontApi";
import { useApiQuery } from "../hooks/useApiQuery";
import "../components/Landing/home.css";

const Home = () => {
  const featured = useApiQuery("home-featured", () => propertyApi.searchProperties({ sort: "featured", availability: "Available", limit: 3 }));

  return (
    <div className="home-page">
      <Hero />
      <FeatureListings featured={featured} />
      <Neighbourhoods />
      <HomeJourney />
    </div>
  );
};

export default Home;
