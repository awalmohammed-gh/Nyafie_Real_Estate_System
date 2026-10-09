import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";
import { usePropertyFacets } from "../../hooks/usePropertyFacets";
import { RevealGroup, RevealItem, SectionHeader } from "./LandingMotion";

// Property types that are standalone houses rather than flats, rooms or stays
const NOT_HOUSES = ["apartment", "hotel", "hotel-apartment", "studio", "single", "penthouse"];

const plural = (count, word) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

const DiscoverCategories = () => {
  const { paths, settings } = usePlatform();
  const facets = usePropertyFacets();
  const data = facets.data;
  const countOf = (types) => data?.types.filter((t) => types.some((type) => type.toLowerCase() === t.value?.toLowerCase())).reduce((sum, t) => sum + t.count, 0);
  const houseTypes = settings.property.propertyTypes.filter((type) => !NOT_HOUSES.includes(type.toLowerCase()));
  const href = (params) => `${paths.listings}?${new URLSearchParams(params)}`;

  const categories = [
    { label: "For Rent", note: "Apartments, houses and rooms to rent", image: "/hero/furnished-bedroom-960.jpg", to: href({ purpose: "rent" }), count: data?.rent, large: true },
    { label: "For Sale", note: "Homes and property ready to own", image: "/hero/heritage-villa-960.jpg", to: href({ purpose: "sale" }), count: data?.sale, large: true },
    { label: "Hotels", note: "Compare rooms and book a stay", image: "/hero/resort-pool-960.jpg", to: href({ type: "Hotel" }), count: countOf(["Hotel"]) },
    { label: "Apartments", note: "Everyday city living", image: "/hero/modern-living-960.jpg", to: href({ type: "Apartment" }), count: countOf(["Apartment"]) },
    { label: "Houses", note: "Villas, bungalows, family homes", image: "/banners/listings-suburb-960.jpg", to: href({ type: houseTypes.join(",") }), count: countOf(houseTypes) },
    { label: "Short stays", note: "Furnished hotel apartments", image: "/banners/properties-resort-960.jpg", to: href({ type: "Hotel-Apartment" }), count: countOf(["Hotel-Apartment"]) },
  ];

  return (
    <section className="home-section home-discover" aria-labelledby="discover-heading">
      <div className="container-page">
        <SectionHeader>
          <div><p className="home-eyebrow">01 / DISCOVER PROPERTIES</p><h2 id="discover-heading" className="home-section-title">Find the right place for <span className="home-serif">your next move.</span></h2></div>
          <div className="home-section-aside">
            <p>Browse homes for rent, properties for sale, hotels and more — listed by HomeBase and approved agents.</p>
            {data && (
              <dl className="home-stats">
                {/* Only real, non-zero numbers */}
                {[["Live listings", data.total], ["Approved agents", data.agents]].filter(([, value]) => value > 0).map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>
                ))}
              </dl>
            )}
          </div>
        </SectionHeader>
        <RevealGroup as="ul" className="home-categories" gap={0.08}>
          {categories.map(({ label, note, image, to, count, large }) => (
            <RevealItem as="li" variant="rise" key={label} className={large ? "is-large" : ""}>
              <Link to={to} className="home-category">
                <img src={image} alt="" loading="lazy" decoding="async" />
                <span className="home-category-body">
                  <span className="home-category-count">{count == null ? " " : count ? plural(count, "listing") : "Coming soon"}</span>
                  <span className="home-category-label">{label}</span>
                  <span className="home-category-note">{note}</span>
                </span>
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
