import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Compass, Crosshair, Loader2, Map as MapIcon, MapPin, Navigation, Search, ShieldCheck } from "lucide-react";
import PropertyRail from "./PropertyRail";
import { SectionHeader } from "./LandingMotion";
import LocationSearch from "../location/LocationSearch";
import { useVisitorLocation } from "../../hooks/useVisitorLocation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { usePlatform } from "../../context/usePlatform";
import { propertyApi } from "../../frontApi";
import { LOCATION_PROBLEMS, permissionState } from "../../utils/visitorLocation";
import { DEFAULT_RADIUS_KM, SEARCH_RADII_KM, nearToParams, widerRadius } from "../../utils/geo";
import "../location/location.css";

const INTENTS = [{ value: "", label: "All" }, { value: "Rent", label: "Rent" }, { value: "Sale", label: "Buy" }];
const SHOWN = 4;

/**
 * "Discover properties near you" on the homepage.
 * First visit: explains why location helps and offers current location, a manual search or skipping.
 * The browser permission prompt only appears after "Use my current location" is pressed, and a
 * refusal is respected. With a location: the nearest listings and a link to the map.
 * Every outcome (denied, unavailable, no results, an API error) leaves something useful on screen,
 * and the featured and recent sections below always load independently.
 */
const NearbyHomes = () => {
  const { paths } = usePlatform();
  const visitor = useVisitorLocation();
  const { choice, position, place, status } = visitor;
  const [manual, setManual] = useState(false);
  const [radius, setRadius] = useState(DEFAULT_RADIUS_KM);
  const [intent, setIntent] = useState("");

  // A returning visitor who already shared their location (and still allows it) sees nearby homes
  // straight away; nobody who hasn't granted permission is ever prompted without pressing the button.
  const { requestDevicePosition } = visitor;
  useEffect(() => {
    if (choice !== "device" || position || status !== "idle") return undefined;
    let active = true;
    permissionState().then((state) => { if (active && state === "granted") requestDevicePosition(); });
    return () => { active = false; };
  }, [choice, position, status, requestDevicePosition]);

  const center = choice === "device" && position ? { source: "device", ...position, label: "your location" }
    : choice === "manual" && place ? { source: "place", ...place }
      : null;
  const results = useApiQuery(
    center ? JSON.stringify({ c: [center.latitude, center.longitude], radius, intent }) : null,
    (signal) => propertyApi.nearbyProperties({ latitude: center.latitude, longitude: center.longitude, radius, listingType: intent, limit: SHOWN }, { signal }),
  );
  const items = results.data?.items || [];
  const total = results.data?.total ?? 0;
  const listingsLink = (extra = {}) => {
    const query = new URLSearchParams({ ...nearToParams(center), radius: String(radius), ...(intent && { status: intent }), ...extra });
    [...query.keys()].forEach((key) => !query.get(key) && query.delete(key));
    return `${paths.listings}?${query}`;
  };

  const useDevice = () => { setManual(false); visitor.requestDevicePosition(); };
  const selectPlace = (selected) => { setManual(false); visitor.setChoice("manual"); visitor.rememberPlace(selected); };
  const locating = status === "locating";
  const problem = LOCATION_PROBLEMS[status] && !center ? LOCATION_PROBLEMS[status] : choice === "denied" && !center ? LOCATION_PROBLEMS.denied : "";
  const search = <LocationSearch onSelect={selectPlace} onUseDevice={useDevice} allowDevice={status !== "denied" && choice !== "denied"} deviceBusy={locating} near={center || undefined} autoFocus={manual} />;

  // 1. First visit (or after "Change location"): the explainer and the three choices
  if (!center && !choice && !problem) {
    return (
      <section className="home-section home-nearby" aria-labelledby="nearby-heading">
        <div className="container-page">
          <div className="home-nearby-intro">
            <span className="home-nearby-emblem" aria-hidden="true"><Compass size={26} /></span>
            <div className="home-nearby-copy">
              <p className="home-eyebrow"><span className="home-live-dot" aria-hidden="true" />NEAR YOU</p>
              <h2 id="nearby-heading" className="home-section-title">Discover properties <span className="home-serif">near you.</span></h2>
              <p>Find houses and apartments available for rent or sale around your current location. Allow location access to discover properties near you and explore more opportunities in your area.</p>
              <p className="home-nearby-privacy"><ShieldCheck size={15} aria-hidden="true" />Your location is only used to find nearby homes. It isn’t saved to your account or shown to anyone.</p>
            </div>
            <div className="home-nearby-choices">
              <button type="button" className="home-nearby-choice is-primary" onClick={useDevice} disabled={locating}>
                {locating ? <Loader2 size={18} className="location-spin" aria-hidden="true" /> : <Crosshair size={18} aria-hidden="true" />}
                <span><strong>{locating ? "Finding your location…" : "Use my current location"}</strong><small>Your browser will ask first</small></span>
              </button>
              <button type="button" className="home-nearby-choice" onClick={() => setManual(true)} aria-expanded={manual}>
                <Search size={18} aria-hidden="true" /><span><strong>Enter location manually</strong><small>A city, town or neighbourhood</small></span>
              </button>
              <button type="button" className="home-nearby-choice is-quiet" onClick={() => visitor.setChoice("skip")}>
                <Compass size={18} aria-hidden="true" /><span><strong>Explore without location</strong><small>Browse featured and new listings</small></span>
              </button>
            </div>
          </div>
          {manual && <div className="home-nearby-search">{search}</div>}
        </div>
      </section>
    );
  }

  // 2. Exploring without location, or location unavailable: a slim search that works any time
  if (!center) {
    return (
      <section className="home-section home-nearby is-compact" aria-label="Search near a location">
        <div className="container-page">
          <div className="home-nearby-strip">
            <span className="home-nearby-emblem is-small" aria-hidden="true"><MapPin size={18} /></span>
            <div className="home-nearby-strip-copy">
              <strong>{locating ? "Finding homes near you…" : problem ? "Search near a place instead" : "Looking for a particular area?"}</strong>
              <span role="status">{locating ? "This only takes a moment. You can also search for a place." : problem || "Search a city or neighbourhood to see the homes closest to it."}</span>
            </div>
            <div className="home-nearby-strip-search">{search}</div>
          </div>
        </div>
      </section>
    );
  }

  // 3. A location: the nearest homes
  const wider = widerRadius(radius);
  return (
    <section className="home-section home-nearby" aria-labelledby="nearby-heading">
      <div className="container-page">
        <SectionHeader>
          <div>
            <p className="home-eyebrow"><span className="home-live-dot" aria-hidden="true" />NEAR YOU</p>
            <h2 id="nearby-heading" className="home-section-title">Homes near <span className="home-serif">{center.source === "device" ? "you." : `${center.label.split(",")[0]}.`}</span></h2>
          </div>
          <div className="home-section-aside">
            <p>{results.loading ? "Finding the closest homes…" : `${total} ${total === 1 ? "home" : "homes"} within ${radius} km${center.source === "device" ? " of your location" : ` of ${center.label}`}.`}</p>
            {total > 0 && <Link to={listingsLink({ view: "map" })} className="home-text-link"><MapIcon size={17} aria-hidden="true" />See them on the map <ArrowUpRight size={18} aria-hidden="true" /></Link>}
          </div>
        </SectionHeader>

        <div className="home-nearby-controls">
          <fieldset className="home-nearby-intents">
            <legend className="sr-only">Rent or buy</legend>
            {INTENTS.map(({ value, label }) => (
              <label key={label} className={intent === value ? "is-active" : ""}>
                <input type="radio" className="sr-only" name="nearby-intent" value={value} checked={intent === value} onChange={() => setIntent(value)} />{label}
              </label>
            ))}
          </fieldset>
          <label className="home-nearby-radius"><span>Within</span>
            <select value={radius} onChange={(event) => setRadius(Number(event.target.value))} aria-label="Search radius">
              {SEARCH_RADII_KM.map((km) => <option key={km} value={km}>{km} km</option>)}
            </select>
          </label>
          <span className="home-nearby-where">{center.source === "device" ? <Navigation size={14} aria-hidden="true" /> : <MapPin size={14} aria-hidden="true" />}{center.source === "device" ? "Your approximate location" : center.label}</span>
          <button type="button" className="home-nearby-change" onClick={() => setManual((value) => !value)} aria-expanded={manual}>{manual ? "Cancel" : "Change location"}</button>
        </div>
        {manual && <div className="home-nearby-search">{search}</div>}

        {results.error ? (
          <div role="alert" className="home-listings-message"><h3>We couldn’t load nearby homes.</h3><p>{results.error}</p><button type="button" onClick={results.reload} className="btn btn-primary mt-4">Try again</button></div>
        ) : !results.loading && items.length === 0 ? (
          <div className="home-listings-message">
            <h3>No properties found around this location.</h3>
            <p>Try a wider area or another location. Featured and newly listed homes are just below.</p>
            <div className="home-nearby-empty-actions">
              {wider && <button type="button" className="btn btn-primary" onClick={() => setRadius(wider)}>Expand to {wider} km</button>}
              <button type="button" className="btn btn-light" onClick={() => setManual(true)}>Change location</button>
              {intent && <button type="button" className="btn btn-light" onClick={() => setIntent("")}>Show rent and sale</button>}
            </div>
          </div>
        ) : (
          <PropertyRail items={items} loading={results.loading} count={SHOWN} columns={4} label="Homes near you" />
        )}
        {total > SHOWN && <p className="home-nearby-more"><Link to={listingsLink()} className="home-text-link">See all {total} nearby homes <ArrowUpRight size={18} aria-hidden="true" /></Link></p>}
      </div>
    </section>
  );
};

export default NearbyHomes;
