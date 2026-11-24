import Hero from "../components/Landing/Hero";
import TrustBar from "../components/Landing/TrustBar";
import LeadListings from "../components/Landing/LeadListings";
import ListingRow from "../components/Landing/ListingRow";
import BrowseAreas from "../components/Landing/BrowseAreas";
import RecentlyViewed from "../components/Landing/RecentlyViewed";
import DiscoverCategories from "../components/Landing/DiscoverCategories";
import HowItWorks from "../components/Landing/HowItWorks";
import HomeAgents from "../components/Landing/HomeAgents";
import BecomeAgent from "../components/Landing/BecomeAgent";
import FinalCta from "../components/Landing/FinalCta";
import { useHome } from "../hooks/useHome";
import { usePlatform } from "../context/usePlatform";
import { homeRows } from "../utils/homeRows";
import { shortStayPath } from "../utils/shortStay";
import "../components/Landing/home.css";

// Homes first: the search, then listings, then ways to browse; how it works and selling come after
const Home = () => {
  const { paths } = usePlatform();
  const home = useHome();
  const { lead, rows } = homeRows(home.data);
  const facets = home.data?.facets;
  const ROWS = {
    latest: { title: "Latest homes", href: `${paths.listings}?sort=latest`, linkText: "View all homes" },
    sale: { title: "Homes for sale", href: `${paths.listings}?status=Sale`, linkText: `See all ${facets?.sale ?? ""} for sale` },
    rent: { title: "Homes for rent", href: `${paths.listings}?status=Rent`, linkText: `See all ${facets?.rent ?? ""} for rent` },
    stays: { title: "Short stays", href: shortStayPath(paths.listings), linkText: `See all ${facets?.stays ?? ""} short stays` },
  };
  const [first, ...rest] = rows;
  const renderRow = ({ id, items }) => <ListingRow key={id} id={id} {...ROWS[id]} items={items} loading={false} />;
  return (
    <div className="home-page home-reference">
      <Hero />
      <LeadListings home={home} lead={lead} />
      <DiscoverCategories facets={facets} />
      {first && renderRow(first)}
      <BrowseAreas facets={facets} />
      {rest.map(renderRow)}
      <RecentlyViewed />
      <TrustBar />
      <HomeAgents />
      <HowItWorks />
      <BecomeAgent />
      <FinalCta />
    </div>
  );
};

export default Home;
