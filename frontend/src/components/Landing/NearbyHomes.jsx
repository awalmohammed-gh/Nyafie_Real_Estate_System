import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Loader2, Map as MapIcon, MapPin, Navigation, X } from "lucide-react";
import PropertyRail from "./PropertyRail";
import { SectionHeader } from "./LandingMotion";
import { WHERE_TRIGGER_ID } from "./Hero";
import { useVisitorLocation } from "../../hooks/useVisitorLocation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { usePlatform } from "../../context/usePlatform";
import { propertyApi } from "../../frontApi";
import { LOCATION_PROBLEMS, permissionState } from "../../utils/visitorLocation";
import { DEFAULT_RADIUS_KM, SEARCH_RADII_KM, nearToParams, widerRadius } from "../../utils/geo";
import "../location/location.css";

const INTENTS = [{ value: "", label: "All" }, { value: "Rent", label: "Rent" }, { value: "Sale", label: "Buy" }];
const SHOWN = 4;

// Opens the hero's "Where?" search, where the visitor chooses their location
const openWhere = () => {
  const where = document.getElementById(WHERE_TRIGGER_ID);
  where?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  setTimeout(() => where?.click(), 350);
};

/**
 * "Homes near you" under the hero. It only appears once the visitor has chosen a location in the
 * hero's "Where?" search (their current location or a place), or is a returning visitor who
 * already allows location. It shows the nearest homes when there are some, and otherwise a single
 * line (locating, nothing nearby, location refused): never a large empty box. Without a location
 * it renders nothing and the page starts with its usual sections.
 */
const NearbyHomes = () => {
  const { paths } = usePlatform();
  const visitor = useVisitorLocation();
  const { choice, position, place, status, requestDevicePosition } = visitor;
  const [radius, setRadius] = useState(DEFAULT_RADIUS_KM);
  const [intent, setIntent] = useState("");

  // A returning visitor who already shared their location (and still allows it) sees nearby homes
  // straight away. Nobody is ever prompted without choosing "Use my current location".
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
  // While a changed radius or Rent/Buy loads, the homes already shown stay on screen
  const shown = results.data || (results.loading ? results.previous : undefined);
  const items = shown?.items || [];
  const total = shown?.total ?? 0;
  const where = center?.source === "device" ? "you" : center?.label.split(",")[0];
  const listingsLink = (extra = {}) => {
    const query = new URLSearchParams({ ...nearToParams(center), radius: String(radius), ...(intent && { status: intent }), ...extra });
    [...query.keys()].forEach((key) => !query.get(key) && query.delete(key));
    return `${paths.listings}?${query}`;
  };
  const forget = () => { visitor.forgetPosition(); visitor.rememberPlace(null); visitor.setChoice(null); };

  // One slim line: finding the location, or why it isn't available
  if (!center) {
    const problem = LOCATION_PROBLEMS[status];
    if (status !== "locating" && !problem) return null;
    return (
      <section className="home-nearby-note-wrap" aria-label="Homes near you">
        <div className="container-page">
          <p className="home-nearby-note" role="status">
            {status === "locating"
              ? <><Loader2 size={16} className="location-spin" aria-hidden="true" />Finding homes near you…</>
              : <><MapPin size={16} aria-hidden="true" /><span>{problem}</span><button type="button" onClick={openWhere}>Choose a place</button></>}
          </p>
        </div>
      </section>
    );
  }

  const wider = widerRadius(radius);
  // Still searching with nothing to show yet: one line, so the page doesn't jump if nothing is found
  if (results.loading && !items.length) {
    return (
      <section className="home-nearby-note-wrap" aria-label={`Homes near ${where}`}>
        <div className="container-page">
          <p className="home-nearby-note" role="status"><Loader2 size={16} className="location-spin" aria-hidden="true" />Finding homes near {where}…</p>
        </div>
      </section>
    );
  }
  // Nothing within the radius (or the search failed): one line, and the featured homes follow
  if (results.error || (!results.loading && items.length === 0)) {
    return (
      <section className="home-nearby-note-wrap" aria-label={`Homes near ${where}`}>
        <div className="container-page">
          <p className="home-nearby-note" role="status">
            <MapPin size={16} aria-hidden="true" />
            <span>{results.error ? "Nearby homes couldn’t load." : `No homes listed within ${radius} km of ${center.source === "device" ? "your location" : center.label} yet.`}</span>
            {results.error ? <button type="button" onClick={results.reload}>Try again</button>
              : wider && <button type="button" onClick={() => setRadius(wider)}>Search within {wider} km</button>}
            <button type="button" onClick={openWhere}>Choose another place</button>
            <button type="button" className="is-quiet" onClick={forget} aria-label="Stop showing homes near this location"><X size={15} aria-hidden="true" /></button>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="home-section home-nearby" aria-labelledby="nearby-heading">
      <div className="container-page">
        <SectionHeader>
          <div>
            <p className="home-eyebrow"><span className="home-live-dot" aria-hidden="true" />NEAR YOU</p>
            <h2 id="nearby-heading" className="home-section-title">Homes near <span className="home-serif">{where}.</span></h2>
          </div>
          <div className="home-section-aside">
            <p>{results.loading ? "Finding the closest homes…" : `${total} ${total === 1 ? "home" : "homes"} within ${radius} km, nearest first.`}</p>
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
          <button type="button" className="home-nearby-change" onClick={openWhere}>Change</button>
          <button type="button" className="home-nearby-change is-quiet" onClick={forget}>Clear</button>
        </div>

        <PropertyRail items={items} loading={results.loading} count={SHOWN} columns={4} label={`Homes near ${where}`} />
        {total > SHOWN && <p className="home-nearby-more"><Link to={listingsLink()} className="home-text-link">See all {total} nearby homes <ArrowUpRight size={18} aria-hidden="true" /></Link></p>}
      </div>
    </section>
  );
};

export default NearbyHomes;
