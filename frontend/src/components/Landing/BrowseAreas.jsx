import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";
import { cloudImage } from "../../utils/cloudImage";
import { homeAreas, homesLabel } from "../../utils/homeRows";
import { RevealBlock, RevealGroup, RevealItem } from "./LandingMotion";

// Where the homes are: neighbourhoods with a photo of a home there, and every town with its count
const BrowseAreas = ({ facets }) => {
  const { paths } = usePlatform();
  const areas = homeAreas(facets);
  const cities = [...(facets?.cities || [])].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 10);
  if (areas.length < 2) return null;
  const href = (params) => `${paths.listings}?${new URLSearchParams(params)}`;
  return (
    <section className="home-section home-areas-section" aria-labelledby="areas-heading">
      <div className="container-page">
        <RevealBlock as="header" className="home-row-heading"><div><h2 id="areas-heading" className="home-section-title">Browse by area</h2><p className="home-section-description">Start with the place you want to live.</p></div></RevealBlock>
        <RevealGroup as="ul" className="home-areas" gap={0.06}>{areas.map((area) => (
          <RevealItem as="li" variant="fade" key={`${area.name}-${area.city}`}><Link to={href({ area: area.name })} className="home-area">
            <img src={cloudImage(area.image, 320)} alt="" loading="lazy" decoding="async" width="320" height="240" />
            <span className="home-area-copy"><strong>{area.name}</strong><small>{[area.city, homesLabel(area.count)].filter(Boolean).join(" · ")}</small></span>
          </Link></RevealItem>
        ))}</RevealGroup>
        {cities.length > 1 && <ul className="home-cities" aria-label="Towns and cities">{cities.map((city) => <li key={city.name}><Link to={href({ city: city.name })}><MapPin size={14} aria-hidden="true" />{city.name}<span>{city.count.toLocaleString()}</span></Link></li>)}</ul>}
      </div>
    </section>
  );
};

export default BrowseAreas;
