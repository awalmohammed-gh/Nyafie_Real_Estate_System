import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Map as MapIcon } from "lucide-react";
import PropertyRail from "./PropertyRail";
import { usePlatform } from "../../context/usePlatform";
import { useHomeListings } from "../../hooks/useHomeListings";
import { useVisitorLocation } from "../../hooks/useVisitorLocation";
import { DEFAULT_RADIUS_KM, nearToParams } from "../../utils/geo";

const categories = [{ value: "", label: "All" }, { value: "Sale", label: "Buy" }, { value: "Rent", label: "Rent" }, { value: "stay", label: "Short Stay" }];

const FeatureListings = () => {
  const { paths } = usePlatform();
  const visitor = useVisitorLocation();
  const [category, setCategory] = useState("");
  const [nearby, setNearby] = useState(false);
  const place = visitor.choice === "device" && visitor.position ? { ...visitor.position, source: "device" } : visitor.choice === "manual" ? visitor.place : null;
  const center = nearby && place ? { latitude: place.latitude, longitude: place.longitude, radius: DEFAULT_RADIUS_KM } : null;
  const query = useHomeListings(category, center);
  const params = new URLSearchParams({ ...(category === "stay" ? { type: "Hotel,Hotel-Apartment" } : category ? { status: category } : {}), ...(center ? { ...nearToParams(place), radius: String(DEFAULT_RADIUS_KM) } : {}) });
  const browseLink = `${paths.listings}${params.size ? `?${params}` : ""}`;
  return <section id="home-listings" className="home-section home-featured" aria-labelledby="featured-heading"><div className="container-page">
    <header className="home-feature-heading">
      <div><p className="home-eyebrow">EXPLORE LISTINGS</p><h2 id="featured-heading" className="home-section-title">Featured properties</h2><p className="home-section-description">Handpicked homes, apartments, and stays across Ghana.</p></div>
      <div className="home-feature-actions">
        <fieldset className="home-filter-tabs"><legend className="sr-only">Featured property category</legend>{categories.map(({ value, label }) => <label key={label} className={category === value ? "is-active" : ""}><input className="sr-only" type="radio" name="featured-category" checked={category === value} onChange={() => setCategory(value)} />{label}</label>)}</fieldset>
        <Link to={browseLink} className="home-text-link">View all properties <ArrowRight size={19} aria-hidden="true" /></Link>
      </div>
    </header>
    {place && <div className="home-feature-controls"><label className="home-nearby-toggle"><input type="checkbox" checked={nearby} onChange={(event) => setNearby(event.target.checked)} />Within {DEFAULT_RADIUS_KM} km of {visitor.choice === "device" ? "you" : place.label?.split(",")[0]}</label>{center && <Link to={`${browseLink}&view=map`} className="home-text-link"><MapIcon size={17} aria-hidden="true" />View on map</Link>}</div>}
    <div aria-live="polite" aria-busy={query.loading}>
      {query.error ? <div role="alert" className="home-listings-message"><h3>Properties could not load.</h3><p>Please try again to see available listings.</p><button type="button" onClick={query.reload} className="home-button">Try again</button></div>
        : !query.loading && !query.data?.items.length ? <div className="home-listings-message"><h3>No properties in this selection yet.</h3><p>{center ? "Try turning off the nearby filter or explore the full catalogue." : "Try another category or explore the full catalogue."}</p><Link to={paths.listings} className="home-text-link">Explore all properties <ArrowRight size={17} aria-hidden="true" /></Link></div>
        : <PropertyRail items={query.data?.items || []} loading={query.loading} count={4} columns={4} label="Featured properties" cardVariant="home" />}
    </div>
  </div></section>;
};
export default FeatureListings;
