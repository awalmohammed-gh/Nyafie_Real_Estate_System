import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Crosshair, MapPin, Navigation, Search, SlidersHorizontal } from "lucide-react";
import HeroSlider from "./HeroSlider";
import HeroSearchSelect from "./HeroSearchSelect";
import { usePropertyFacets } from "../../hooks/usePropertyFacets";
import { usePlatform } from "../../context/usePlatform";
import { useNavOverlay } from "../../context/navOverlay";
import { formatType } from "../../utils/property";
import { DEFAULT_RADIUS_KM, DEVICE, nearToParams } from "../../utils/geo";
import { useVisitorLocation } from "../../hooks/useVisitorLocation";
import { geoApi } from "../../frontApi";

const NEAR_ME = "__near_me__"; // an option value no neighbourhood can have
export const WHERE_TRIGGER_ID = "home-where";

const statuses = [
  { label: "All homes", value: "" },
  { label: "Buy", value: "Sale" },
  { label: "Rent", value: "Rent" },
];

// Shown when every slide is switched off in Admin Settings > Homepage Hero
const fallbackSlide = {
  id: "fallback",
  title: "Find your kind of *home.*",
  description: "The city you love. The space you need. Discover homes to buy and rent across Ghana, all in one place.",
  primaryText: "Explore homes",
  primaryLink: "/listings",
};

const Hero = () => {
  useNavOverlay(); // the navbar sits transparently over the photo
  const navigate = useNavigate();
  const { paths, settings } = usePlatform();
  const visitor = useVisitorLocation();
  const [search, setSearch] = useState({ status: "", area: "", type: "" });
  // A place picked from the map: { label, latitude, longitude } (its option value starts with "place:")
  const [place, setPlace] = useState(null);
  const facets = usePropertyFacets(search.status);
  const areas = [...(facets.data?.areas || [])].sort((a, b) => a.name.localeCompare(b.name)).map((area) => ({ value: area.name, label: area.name, description: [area.city, area.region].filter(Boolean).join(" · "), count: area.count }));
  const types = [...(facets.data?.types || [])].sort((a, b) => a.value.localeCompare(b.value)).map((type) => ({ value: type.value, label: formatType(type.value), count: type.count }));
  const active = settings.hero.slides.filter((slide) => slide.active && slide.image);
  const slides = active.length ? active : [fallbackSlide];
  const nearMe = { value: NEAR_ME, label: "Use my current location", description: "See homes around you. Only used to find nearby homes.", icon: Crosshair, action: true };
  const searchMap = (query, signal) => geoApi.searchPlaces(query, { signal }).then((places) => places.map((found) => ({ value: `place:${found.id}`, label: found.name, description: found.description, icon: Navigation, place: found })));

  // Choosing a location also shows "Homes near …" under the hero, before the visitor even searches
  const chooseWhere = (value, option) => {
    setSearch((previous) => ({ ...previous, area: value }));
    if (value === NEAR_ME) {
      setPlace(null);
      visitor.requestDevicePosition(); // the browser asks now: the visitor pressed the button
    } else if (option?.place) {
      const chosen = { source: "place", label: option.place.label, latitude: option.place.latitude, longitude: option.place.longitude };
      setPlace(chosen);
      visitor.setChoice("manual");
      visitor.rememberPlace(chosen);
    } else setPlace(null);
  };
  const whereLabel = search.area === NEAR_ME
    ? visitor.status === "locating" ? "Finding your location…" : "Near me"
    : search.area.startsWith("place:") && place ? place.label : undefined;

  const handleSearch = (event) => {
    event.preventDefault();
    const { area, ...rest } = search;
    // Near me or a map place: nearby search within 5 km; one of our neighbourhoods: that area's homes
    const where = area === NEAR_ME ? { near: DEVICE, radius: String(DEFAULT_RADIUS_KM) }
      : area.startsWith("place:") && place ? { ...nearToParams(place), radius: String(DEFAULT_RADIUS_KM) }
        : { area };
    const params = new URLSearchParams(Object.entries({ ...rest, ...where }).filter(([, value]) => value));
    navigate(`${paths.listings}${params.size ? `?${params}` : ""}`);
  };

  return (
    <section className="home-hero" aria-labelledby="home-heading">
      <h1 id="home-heading" className="sr-only">{settings.general.siteName}: homes to buy and rent</h1>
      {/* Keyed by the slide set so it starts again at slide 1 when an admin changes the slides */}
      <HeroSlider key={slides.map((slide) => slide.id).join()} slides={slides}>
        <div className="home-search" aria-label="Find a property">
          <div className="home-search-topline">
            <fieldset className="home-search-tabs">
              <legend className="sr-only">I want to</legend>
              {statuses.map(({ label, value }) => (
                <label key={label} className={`home-search-tab ${search.status === value ? "is-active" : ""}`}>
                  <input className="sr-only" type="radio" name="listing-intent" value={value} checked={search.status === value} onChange={() => setSearch((previous) => ({ status: value, type: "", area: previous.area === NEAR_ME || previous.area.startsWith("place:") ? previous.area : "" }))} />
                  {label}
                </label>
              ))}
            </fieldset>
            <p className="home-search-count" aria-live="polite">{facets.data ? `${facets.data.total} ${facets.data.total === 1 ? "home" : "homes"} to explore` : "Your search starts here"}</p>
          </div>
          <form key={search.status} onSubmit={handleSearch} className="home-search-form">
            <HeroSearchSelect
              icon={MapPin} label="Where?" title="Where do you want to live?" name="area" placeholder="All locations" triggerId={WHERE_TRIGGER_ID}
              value={search.area} selectedLabel={whereLabel} disabled={facets.loading} onChange={chooseWhere}
              actions={[nearMe]}
              options={[{ value: "", label: "All locations", description: "Explore homes across Ghana", count: facets.data?.total }, ...areas]}
              searchRemote={searchMap} remoteHeading="Places on the map" searchPlaceholder="Type a city, neighbourhood or place…"
              emptyHint={(typed) => `No places match “${typed}”. Try a nearby town or neighbourhood.`}
              footerHint="Your areas first, then places on the map"
            />
            <HeroSearchSelect icon={SlidersHorizontal} label="Your kind of space" title="Find your kind of space" name="type" placeholder="Any property type" value={search.type} disabled={facets.loading} onChange={(value) => setSearch((previous) => ({ ...previous, type: value }))} options={[{ value: "", label: "Any property type", description: "A little room for every possibility", count: facets.data?.total }, ...types]} />
            <button type="submit" className="home-search-submit"><Search size={18} aria-hidden="true" /> Find my home <ArrowUpRight size={18} aria-hidden="true" /></button>
          </form>
          {facets.error && <p role="status" className="home-search-error">Filter options couldn’t load. You can still browse all {search.status === "Rent" ? "rentals" : search.status === "Sale" ? "homes for sale" : "homes"}. <button type="button" onClick={facets.reload}>Try again</button></p>}
        </div>
      </HeroSlider>
    </section>
  );
};

export default Hero;
