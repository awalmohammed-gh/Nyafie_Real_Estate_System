import { Link } from "react-router-dom";
import { ArrowUpRight, MapPin } from "lucide-react";
import { usePropertyFacets } from "../../hooks/usePropertyFacets";
import { usePlatform } from "../../context/usePlatform";

const Neighbourhoods = () => {
  const { paths } = usePlatform();
  const facets = usePropertyFacets();
  const places = (facets.data?.areas || []).slice(0, 4);
  if (!places.length) return null;

  return (
    <section className="home-section home-places" aria-labelledby="places-heading">
      <div className="container-page home-places-layout">
        <div className="home-places-intro"><p className="home-eyebrow">02 / FIND YOUR CORNER</p><h2 id="places-heading" className="home-section-title">Love where<br />you <span className="home-serif">land.</span></h2><p>Start with a neighbourhood.<br />Discover the homes that put you there.</p><Link to={paths.listings} className="home-text-link">See every location <ArrowUpRight size={18} aria-hidden="true" /></Link><span className="home-places-coordinate"><MapPin size={15} aria-hidden="true" /> A place in Ghana. A place for you.</span></div>
        <div className="home-places-grid">
          {places.map((place, index) => (
            <Link key={place.name} to={`${paths.listings}?area=${encodeURIComponent(place.name)}`} className="home-place" aria-label={`Explore ${place.name}: ${place.count} ${place.count === 1 ? "home" : "homes"}`}>
              <div className="home-place-image">{place.image && <img src={place.image} alt={`A home in ${place.name}`} loading="lazy" decoding="async" />}<span className="home-place-number" aria-hidden="true">0{index + 1}</span><span className="home-place-open"><ArrowUpRight size={21} aria-hidden="true" /></span></div>
              <div className="home-place-caption"><div><h3>{place.name}</h3><p>{place.city}</p></div><span>{place.count} {place.count === 1 ? "home" : "homes"}</span></div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Neighbourhoods;
