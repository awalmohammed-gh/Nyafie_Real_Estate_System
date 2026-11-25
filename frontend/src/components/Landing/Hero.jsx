import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  BedDouble,
  Building2,
  CalendarDays,
  Coins,
  Crosshair,
  House,
  Map as MapIcon,
  MapPin,
  Navigation,
  Search,
} from "lucide-react";
import HeroSlider from "./HeroSlider";
import HeroSearchSelect from "./HeroSearchSelect";
import { usePropertyFacets } from "../../hooks/usePropertyFacets";
import { usePlatform } from "../../context/usePlatform";
import { formatType } from "../../utils/property";
import { DEFAULT_RADIUS_KM, DEVICE, nearToParams } from "../../utils/geo";
import { useVisitorLocation } from "../../hooks/useVisitorLocation";
import { geoApi } from "../../frontApi";
import { priceRanges, priceUnit } from "../../utils/browseTabs";
import NavOverlay from "../nav/NavOverlay";

const NEAR_ME = "__near_me__"; // an option value no neighbourhood can have
export const WHERE_TRIGGER_ID = "home-where";

const statuses = [
  { label: "Buy", value: "Sale", Icon: House },
  { label: "Rent", value: "Rent", Icon: CalendarDays },
  { label: "Short Stay", value: "stay", Icon: BedDouble },
];

// Shown when every slide is switched off in Admin Settings > Homepage Hero
const fallbackSlide = {
  id: "fallback",
  title: "Find your kind of *home.*",
  description:
    "The city you love. The space you need. Discover homes to buy and rent across Ghana, all in one place.",
  primaryText: "Explore homes",
  primaryLink: "/listings",
};

const Hero = () => {
  const reducedMotion = useReducedMotion();
  const navigate = useNavigate();
  const { paths, settings } = usePlatform();
  const visitor = useVisitorLocation();
  const [search, setSearch] = useState({
    status: "Sale",
    area: "",
    type: "",
    price: "",
  });
  const [mapHint, setMapHint] = useState(false);
  // A place picked from the map: { label, latitude, longitude } (its option value starts with "place:")
  const [place, setPlace] = useState(null);
  const facets = usePropertyFacets(search.status);
  const areas = [...(facets.data?.areas || [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((area) => ({
      value: area.name,
      label: area.name,
      description: [area.city, area.region].filter(Boolean).join(" · "),
      count: area.count,
    }));
  const types = [...(facets.data?.types || [])]
    .sort((a, b) => a.value.localeCompare(b.value))
    .map((type) => ({
      value: type.value,
      label: formatType(type.value),
      count: type.count,
    }));
  const active = settings.hero.slides.filter(
    (slide) => slide.active && slide.image,
  );
  // The first slide introduces the platform: a whole neighbourhood of homes to choose from
  const slides = [
    {
      ...fallbackSlide,
      id: "nyafie-introduction",
      image: "/hero/nyafie-modern-villa.jpg",
      position: "center",
    },
    ...active,
  ];
  const nearMe = {
    value: NEAR_ME,
    label: "Use my current location",
    description: "See homes around you. Only used to find nearby homes.",
    icon: Crosshair,
    action: true,
  };
  const searchMap = (query, signal) =>
    geoApi
      .searchPlaces(query, { signal })
      .then((places) =>
        places.map((found) => ({
          value: `place:${found.id}`,
          label: found.name,
          description: found.description,
          icon: Navigation,
          place: found,
        })),
      );

  // Keep the chosen location available to the featured properties' nearby filter.
  const chooseWhere = (value, option) => {
    setSearch((previous) => ({ ...previous, area: value }));
    if (value === NEAR_ME) {
      setPlace(null);
      visitor.requestDevicePosition(); // the browser asks now: the visitor pressed the button
    } else if (option?.place) {
      const chosen = {
        source: "place",
        label: option.place.label,
        latitude: option.place.latitude,
        longitude: option.place.longitude,
      };
      setPlace(chosen);
      visitor.setChoice("manual");
      visitor.rememberPlace(chosen);
    } else setPlace(null);
  };
  const whereLabel =
    search.area === NEAR_ME
      ? visitor.status === "locating"
        ? "Finding your location…"
        : "Near me"
      : search.area.startsWith("place:") && place
        ? place.label
        : undefined;

  const handleSearch = (event) => {
    event.preventDefault();
    const { area, status, type, price } = search;
    const mapView = event.nativeEvent.submitter?.value === "map";
    if (mapView && area !== NEAR_ME && !(area.startsWith("place:") && place)) {
      setMapHint(true);
      document.getElementById(WHERE_TRIGGER_ID)?.click();
      return;
    }
    // Near me or a map place: nearby search within 5 km; one of our neighbourhoods: that area's homes
    const where =
      area === NEAR_ME
        ? { near: DEVICE, radius: String(DEFAULT_RADIUS_KM) }
        : area.startsWith("place:") && place
          ? { ...nearToParams(place), radius: String(DEFAULT_RADIUS_KM) }
          : { area };
    const budget = price === "" ? null : priceRanges(status)[Number(price)];
    const params = new URLSearchParams(
      Object.entries({
        status: status === "stay" ? "" : status,
        stay: status === "stay" ? "1" : "",
        type,
        minPrice: budget?.min,
        maxPrice: budget?.max,
        ...where,
        ...(mapView && { view: "map" }),
      }).filter(
        ([, value]) => value !== "" && value !== undefined && value !== null,
      ),
    );
    navigate(`${paths.listings}${params.size ? `?${params}` : ""}`);
  };

  return (
    <section className="home-hero" aria-labelledby="home-heading">
      {/* The navbar is transparent over the hero photo (solid while the page is still loading) */}
      <NavOverlay />
      {/* Keyed by the slide set so it starts again at slide 1 when an admin changes the slides */}
      <HeroSlider
        key={slides.map((slide) => slide.id).join()}
        slides={slides}
        marketplace
      >
        {/* Rises in once the slide's text has appeared (HeroSlider: the text finishes at about 1s),
            so the eye reads the headline first. Only on the first arrival, not on every slide change. */}
        <motion.div className="home-search" aria-label="Find a property"
          initial={reducedMotion ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.85, ease: [0.22, 1, 0.36, 1] }}>
          <div className="home-search-topline">
            <fieldset className="home-search-tabs">
              <legend className="sr-only">I want to</legend>
              {statuses.map(({ label, value, Icon }) => (
                <label
                  key={label}
                  className={`home-search-tab ${search.status === value ? "is-active" : ""}`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="listing-intent"
                    value={value}
                    checked={search.status === value}
                    onChange={() =>
                      setSearch((previous) => ({
                        status: value,
                        type: "",
                        price: "",
                        area:
                          previous.area === NEAR_ME ||
                          previous.area.startsWith("place:")
                            ? previous.area
                            : "",
                      }))
                    }
                  />
                  <Icon size={18} aria-hidden="true" />{label}
                </label>
              ))}
            </fieldset>
          </div>
          <form
            key={search.status}
            onSubmit={handleSearch}
            className="home-search-form"
          >
            <HeroSearchSelect
              icon={MapPin}
              label="Location"
              title="Where do you want to live?"
              name="area"
              placeholder="e.g. East Legon, Kumasi..."
              triggerId={WHERE_TRIGGER_ID}
              value={search.area}
              selectedLabel={
                search.area ? whereLabel : "e.g. East Legon, Kumasi..."
              }
              onChange={chooseWhere}
              actions={[nearMe]}
              options={[
                {
                  value: "",
                  label: "All locations",
                  description: "Explore homes across Ghana",
                  count: facets.data?.total,
                },
                ...areas,
              ]}
              searchRemote={searchMap}
              remoteHeading="Places on the map"
              searchPlaceholder="Type a city, neighbourhood or place…"
              emptyHint={(typed) =>
                `No places match “${typed}”. Try a nearby town or neighbourhood.`
              }
              footerHint="Your areas first, then places on the map"
            />
            <HeroSearchSelect
              icon={Building2}
              label="Property type"
              title="Choose a property type"
              name="type"
              placeholder="Any property type"
              value={search.type}
              disabled={facets.loading}
              onChange={(value) =>
                setSearch((previous) => ({ ...previous, type: value }))
              }
              options={[
                {
                  value: "",
                  label: "Any property type",
                  count: facets.data?.total,
                },
                ...types,
              ]}
            />
            <HeroSearchSelect
              icon={Coins}
              label="Price range"
              title="Choose your price range"
              name="price"
              placeholder="Any price"
              value={search.price}
              onChange={(value) =>
                setSearch((previous) => ({ ...previous, price: value }))
              }
              options={[
                { value: "", label: "Any price" },
                ...priceRanges(search.status).map((range, index) => ({
                  value: String(index),
                  label: range.label,
                })),
              ]}
              footerHint={`Prices ${priceUnit(search.status)}.`}
            />
            <button type="submit" className="home-search-submit">
              <Search size={18} aria-hidden="true" /> Search Properties
            </button>
            <div className="home-search-map-row">
              <span className={mapHint ? "is-visible" : ""} role="status">
                {mapHint
                  ? "Choose a map place or use your current location."
                  : ""}
              </span>
              <button
                type="submit"
                name="view"
                value="map"
                className="home-text-link"
              >
                <MapIcon size={15} aria-hidden="true" />
                Explore on map <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            </div>
          </form>
          {facets.error && (
            <p role="status" className="home-search-error">
              Filter options couldn’t load. You can still browse all{" "}
              {search.status === "Rent"
                ? "rentals"
                : search.status === "Sale"
                  ? "homes for sale"
                  : "homes"}
              .{" "}
              <button type="button" onClick={facets.reload}>
                Try again
              </button>
            </p>
          )}
        </motion.div>
      </HeroSlider>
    </section>
  );
};

export default Hero;
