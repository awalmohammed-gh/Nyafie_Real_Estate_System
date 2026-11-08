import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, MapPin, Search, SlidersHorizontal } from "lucide-react";
import HeroSlider from "./HeroSlider";
import HeroSearchSelect from "./HeroSearchSelect";
import { usePropertyFacets } from "../../hooks/usePropertyFacets";
import { usePlatform } from "../../context/usePlatform";
import { useNavOverlay } from "../../context/navOverlay";
import { formatType } from "../../utils/property";
import { DEFAULT_RADIUS_KM, DEVICE } from "../../utils/geo";

const NEAR_ME = "__near_me__"; // an option value no neighbourhood can have

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
  const [search, setSearch] = useState({ status: "", area: "", type: "" });
  const facets = usePropertyFacets(search.status);
  const areas = [...(facets.data?.areas || [])].sort((a, b) => a.name.localeCompare(b.name)).map((area) => ({ value: area.name, label: area.name, description: [area.city, area.region].filter(Boolean).join(" · "), count: area.count }));
  const types = [...(facets.data?.types || [])].sort((a, b) => a.value.localeCompare(b.value)).map((type) => ({ value: type.value, label: formatType(type.value), count: type.count }));
  const active = settings.hero.slides.filter((slide) => slide.active && slide.image);
  const slides = active.length ? active : [fallbackSlide];

  const handleSearch = (event) => {
    event.preventDefault();
    // "Near me": the listings page asks for the visitor's location (or offers a place search)
    const { area, ...rest } = search;
    const chosen = area === NEAR_ME ? { ...rest, near: DEVICE, radius: String(DEFAULT_RADIUS_KM) } : search;
    const params = new URLSearchParams(Object.entries(chosen).filter(([, value]) => value));
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
                  <input className="sr-only" type="radio" name="listing-intent" value={value} checked={search.status === value} onChange={() => setSearch({ status: value, area: "", type: "" })} />
                  {label}
                </label>
              ))}
            </fieldset>
            <p className="home-search-count" aria-live="polite">{facets.data ? `${facets.data.total} ${facets.data.total === 1 ? "home" : "homes"} to explore` : "Your search starts here"}</p>
          </div>
          <form key={search.status} onSubmit={handleSearch} className="home-search-form">
            <HeroSearchSelect icon={MapPin} label="Where?" title="Choose your location" name="area" placeholder="All locations" value={search.area} disabled={facets.loading} onChange={(value) => setSearch((previous) => ({ ...previous, area: value }))} options={[{ value: "", label: "All locations", description: "Explore homes across Ghana", count: facets.data?.total }, { value: NEAR_ME, label: "Near me", description: "Homes within 5 km of your location" }, ...areas]} />
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
