import { Link } from "react-router-dom";
import { ArrowUpRight, MapPin } from "lucide-react";
import { usePropertyFacets } from "../../hooks/usePropertyFacets";
import { usePlatform } from "../../context/usePlatform";
import { RevealGroup, RevealItem, SectionHeader } from "./LandingMotion";

// Areas come from live listings (most listings first), so the list follows what agents post
const Neighbourhoods = () => {
  const { paths } = usePlatform();
  const facets = usePropertyFacets();
  const places = (facets.data?.areas || []).slice(0, 6);
  if (!places.length) return null;

  return (
    <section className="home-section home-places" aria-labelledby="places-heading">
      <div className="container-page">
        <SectionHeader>
          <div><p className="home-eyebrow">08 / POPULAR LOCATIONS</p><h2 id="places-heading" className="home-section-title">Explore <span className="home-serif">popular locations.</span></h2></div>
          <div className="home-section-aside"><p>Discover properties in the places people are searching for.</p><Link to={paths.listings} className="home-text-link">See every location <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        </SectionHeader>
        <RevealGroup as="ul" className="home-places-grid" gap={0.08}>
          {places.map((place) => (
            <RevealItem as="li" variant="rise" key={place.name}>
              <Link to={`${paths.listings}?area=${encodeURIComponent(place.name)}`} className="home-place" aria-label={`Explore ${place.name}: ${place.count} ${place.count === 1 ? "property" : "properties"}`}>
                <div className="home-place-image">{place.image && <img src={place.image} alt="" loading="lazy" decoding="async" />}<span className="home-place-open"><ArrowUpRight size={19} aria-hidden="true" /></span></div>
                <div className="home-place-caption"><div><h3>{place.name}</h3><p><MapPin size={12} aria-hidden="true" />{place.city || place.region || "Ghana"}</p></div><span>{place.count} {place.count === 1 ? "property" : "properties"}</span></div>
              </Link>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
};

export default Neighbourhoods;
