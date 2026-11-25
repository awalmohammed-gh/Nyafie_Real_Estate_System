import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Map as MapIcon } from "lucide-react";
import ListingRow from "./ListingRow";
import { usePlatform } from "../../context/usePlatform";
import { useNearbyHomes } from "../../hooks/useHomeListings";
import { useVisitorLocation } from "../../hooks/useVisitorLocation";
import { DEFAULT_RADIUS_KM, nearToParams } from "../../utils/geo";
import { homesLabel } from "../../utils/homeRows";

// The first homes on the page: featured ones when there are any, otherwise the newest; or homes nearby
const LeadListings = ({ home, lead }) => {
  const { paths } = usePlatform();
  const visitor = useVisitorLocation();
  const [nearby, setNearby] = useState(false);
  const place = visitor.choice === "device" && visitor.position ? { ...visitor.position, source: "device" } : visitor.choice === "manual" ? visitor.place : null;
  const center = nearby && place ? { latitude: place.latitude, longitude: place.longitude, radius: DEFAULT_RADIUS_KM } : null;
  const near = useNearbyHomes(center);
  const query = center ? near : home;
  const items = center ? near.data?.items || [] : lead.items;
  const nearLink = center ? `${paths.listings}?${new URLSearchParams({ ...nearToParams(place), radius: String(DEFAULT_RADIUS_KM) })}` : "";
  const total = home.data?.facets?.total || 0;
  const fresh = home.data?.newThisWeek || 0;
  const summary = total ? `${homesLabel(total)} across Ghana${fresh ? ` · ${fresh.toLocaleString()} new this week` : ""}` : "Homes to buy, rent and stay across Ghana.";

  return (
    <ListingRow lead id="lead" title={center ? "Homes near you" : lead.id === "featured" ? "Featured homes" : "Latest homes"} description={summary} href={center ? nearLink : paths.listings} linkText={center ? "See all nearby" : "View all homes"} items={items} loading={query.loading}>
      {place && <div className="home-feature-controls"><label className="home-nearby-toggle"><input type="checkbox" checked={nearby} onChange={(event) => setNearby(event.target.checked)} />Within {DEFAULT_RADIUS_KM} km of {visitor.choice === "device" ? "you" : place.label?.split(",")[0]}</label>{center && <Link to={`${nearLink}&view=map`} className="home-text-link"><MapIcon size={17} aria-hidden="true" />View on map</Link>}</div>}
      {query.error ? <div role="alert" className="home-listings-message"><h3>Homes could not load.</h3><p>Please try again to see available listings.</p><button type="button" onClick={query.reload} className="home-button">Try again</button></div>
        : !query.loading && !items.length && <div className="home-listings-message"><h3>{center ? "No homes nearby yet." : "No homes listed yet."}</h3><p>{center ? "Turn off the nearby filter to see every home." : "New homes appear here as soon as they're listed."}</p><Link to={paths.listings} className="home-text-link">Explore all homes <ArrowRight size={17} aria-hidden="true" /></Link></div>}
    </ListingRow>
  );
};

export default LeadListings;
