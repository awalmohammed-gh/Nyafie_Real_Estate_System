import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, ChevronDown, MapPin, Search, SlidersHorizontal } from "lucide-react";
import HeroSlider from "./HeroSlider";
import { usePropertyFacets } from "../../hooks/usePropertyFacets";
import { usePlatform } from "../../context/usePlatform";
import { useNavOverlay } from "../../context/navOverlay";
import { formatType } from "../../utils/property";

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

const SearchSelect = ({ icon: Icon, label, name, value, onChange, disabled, children }) => (
  <label className="home-search-field">
    <Icon size={19} aria-hidden="true" />
    <span className="min-w-0 flex-1">
      <span className="home-field-label">{label}</span>
      <select name={name} value={value} onChange={onChange} disabled={disabled}>
        {children}
      </select>
    </span>
    <ChevronDown size={16} aria-hidden="true" className="pointer-events-none shrink-0" />
  </label>
);

const Hero = () => {
  useNavOverlay(); // the navbar sits transparently over the photo
  const navigate = useNavigate();
  const { paths, settings } = usePlatform();
  const [search, setSearch] = useState({ status: "", area: "", type: "" });
  const facets = usePropertyFacets(search.status);
  const areas = (facets.data?.areas || []).map((area) => area.name).sort();
  const types = (facets.data?.types || []).map((type) => type.value).sort();
  const active = settings.hero.slides.filter((slide) => slide.active && slide.image);
  const slides = active.length ? active : [fallbackSlide];

  const handleSearch = (event) => {
    event.preventDefault();
    const params = new URLSearchParams(Object.entries(search).filter(([, value]) => value));
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
          <form onSubmit={handleSearch} className="home-search-form">
            <SearchSelect icon={MapPin} label="Where?" name="area" value={search.area} disabled={facets.loading} onChange={(event) => setSearch((previous) => ({ ...previous, area: event.target.value }))}>
              <option value="">{facets.loading ? "Loading areas…" : "All locations"}</option>
              {areas.map((area) => <option key={area} value={area}>{area}</option>)}
            </SearchSelect>
            <SearchSelect icon={SlidersHorizontal} label="Your kind of space" name="type" value={search.type} disabled={facets.loading} onChange={(event) => setSearch((previous) => ({ ...previous, type: event.target.value }))}>
              <option value="">{facets.loading ? "Loading types…" : "Any property type"}</option>
              {types.map((type) => <option key={type} value={type}>{formatType(type)}</option>)}
            </SearchSelect>
            <button type="submit" className="home-search-submit"><Search size={18} aria-hidden="true" /> Find my home <ArrowUpRight size={18} aria-hidden="true" /></button>
          </form>
          {facets.error && <p role="status" className="home-search-error">Filter options couldn’t load. You can still browse all {search.status === "Rent" ? "rentals" : search.status === "Sale" ? "homes for sale" : "homes"}. <button type="button" onClick={facets.reload}>Try again</button></p>}
        </div>
      </HeroSlider>
    </section>
  );
};

export default Hero;
