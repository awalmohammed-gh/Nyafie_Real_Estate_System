import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Heart, House, KeyRound, MapPin, RotateCcw, Search, SlidersHorizontal, Tag, X } from "lucide-react";
import HouseCard from "./card/HouseCard";
import NearbyBar from "./location/NearbyBar";
import { useVisitorLocation } from "../hooks/useVisitorLocation";
import { LOCATION_PROBLEMS } from "../utils/visitorLocation";
import { DEFAULT_RADIUS_KM, DEVICE, describeSearchArea, nearToParams, parseNear, widerRadius } from "../utils/geo";
import ListingsBanner from "./property/ListingsBanner";
import SkeletonGrid from "./ui/SkeletonGrid";
import { PropertyFilterDialog, PropertyFilterPanel } from "./property/PropertyFilters";
import { useApiQuery } from "../hooks/useApiQuery";
import { usePropertyBrowseState } from "../hooks/usePropertyBrowseState";
import { usePropertyFacets } from "../hooks/usePropertyFacets";
import { usePlatform } from "../context/usePlatform";
import { propertyApi } from "../frontApi";
import { formatType } from "../utils/property";
import "./property/catalogue.css";
import "./property/catalogueSearch.css";

const PAGE_SIZE = 9;
const INTENTS = [{ value: "", label: "All homes", icon: House }, { value: "Sale", label: "Buy", icon: Tag }, { value: "Rent", label: "Rent", icon: KeyRound }];
const SORTS = [
  { value: "", label: "Recommended" }, { value: "latest", label: "Newest first" },
  { value: "priceAsc", label: "Price: low to high" }, { value: "priceDesc", label: "Price: high to low" },
  { value: "popular", label: "Most viewed" }, { value: "rating", label: "Top rated" },
];
// Searching near a place: distance replaces "Recommended" as the default order
const NEARBY_SORTS = [{ value: "", label: "Nearest first" }, ...SORTS.slice(1)];
const MAP_MARKER_LIMIT = 200;
// Leaflet is loaded only when someone opens the map
const DiscoveryMap = lazy(() => import("./location/DiscoveryMap"));

// banner (optional): { image: { src, srcSet, position }, heading } shows the full-width image banner
const PropertyBrowser = ({ title, description, fixedListingType, banner }) => {
  const { paths } = usePlatform();
  const navigate = useNavigate();
  const { filters, query, search, sort, page, view, params: urlParams, update, clear } = usePropertyBrowseState(fixedListingType);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [changingLocation, setChangingLocation] = useState(false);
  const resultsRef = useRef(null);
  const locationInputRef = useRef(null);
  const allFacets = usePropertyFacets();
  const facets = usePropertyFacets(filters.listingType);
  const visitor = useVisitorLocation();
  // ?near=me (device, approximate) or ?near=lat,lng&place=… ; pending while the device position loads
  const near = parseNear(urlParams, visitor.position);
  const nearbyActive = Boolean(near && !near.pending);
  const locating = near?.source === "device" && near.pending && ["idle", "locating"].includes(visitor.status);
  const locationProblem = near?.source === "device" && near.pending ? LOCATION_PROBLEMS[visitor.status] || "" : "";
  const params = {
    page, limit: PAGE_SIZE, search, sort, listingType: filters.listingType,
    type: filters.types, area: filters.area, city: filters.city, region: filters.region, minPrice: filters.price?.min ?? undefined,
    maxPrice: filters.price?.max ?? undefined, bedrooms: filters.beds || undefined,
    bathrooms: filters.baths || undefined, availability: filters.availability, amenities: filters.amenities,
  };
  const searchArea = nearbyActive ? { latitude: near.latitude, longitude: near.longitude, radius: near.radius } : null;
  // Without a usable location this is the normal search, so the page is never empty while locating
  const results = useApiQuery(JSON.stringify({ params, searchArea }), (signal) => searchArea
    ? propertyApi.nearbyProperties({ ...params, ...searchArea }, { signal })
    : propertyApi.searchProperties(params, { signal }));
  const showMap = nearbyActive && view === "map";
  const markerParams = { ...params, page: undefined, limit: undefined };
  const markers = useApiQuery(showMap ? JSON.stringify({ markerParams, searchArea }) : null, (signal) => propertyApi.nearbyMarkers({ ...markerParams, ...searchArea }, { signal }));
  const shownMarkers = markers.data || markers.previous;

  // Arriving with ?near=me (e.g. from the homepage): ask for the position the visitor chose to share.
  // A permission they already refused is not asked again (utils/visitorLocation.js).
  const { status: visitorStatus, requestDevicePosition } = visitor;
  useEffect(() => {
    if (near?.source === "device" && near.pending && visitorStatus === "idle") requestDevicePosition();
  }, [near?.source, near?.pending, visitorStatus, requestDevicePosition]);

  const selectPlace = (place) => {
    visitor.setChoice("manual");
    visitor.rememberPlace(place);
    update({ ...nearToParams(place), radius: near?.radius || DEFAULT_RADIUS_KM });
  };
  const useDevice = () => {
    update({ near: DEVICE, place: "", radius: near?.radius || DEFAULT_RADIUS_KM });
    if (!visitor.position) visitor.requestDevicePosition();
  };
  const clearLocation = () => update({ near: "", place: "", radius: "", view: "" });
  const searchMapArea = (center) => update({ ...nearToParams({ source: "place", ...center, label: "the area on the map" }) });
  const changeLocation = () => {
    setChangingLocation(true);
    requestAnimationFrame(() => locationInputRef.current?.focus());
  };
  const shown = results.data || results.previous;
  const pending = results.loading || query.trim() !== search;
  const total = shown?.total ?? 0;
  const firstLoad = results.loading && !shown;
  const shownPage = shown?.page || page;
  const first = total ? (shownPage - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(shownPage * PAGE_SIZE, total);
  const words = title.split(" ");

  const changeIntent = (value) => {
    if (value === filters.listingType) return;
    if (fixedListingType) navigate(value === "Sale" ? "/sale" : value === "Rent" ? "/rent" : paths.listings);
    else update({ listingType: value, area: "", types: [], price: null });
  };

  const activeFilters = [
    ...filters.types.map((type) => ({ key: `type:${type}`, kind: "type", value: type, label: formatType(type), clear: () => update({ types: filters.types.filter((value) => value !== type) }) })),
    filters.area && { key: "area", kind: "area", value: filters.area, label: filters.area, clear: () => update({ area: "" }) },
    filters.city && { key: "city", kind: "city", value: filters.city, label: filters.city, clear: () => update({ city: "", area: "" }) },
    filters.region && { key: "region", kind: "region", value: filters.region, label: filters.region, clear: () => update({ region: "", city: "", area: "" }) },
    filters.price && { key: "price", kind: "price", value: filters.price, label: filters.price.label, clear: () => update({ price: null }) },
    filters.beds > 0 && { key: "beds", kind: "beds", value: filters.beds, label: `${filters.beds}+ beds`, clear: () => update({ beds: 0 }) },
    filters.baths > 0 && { key: "baths", kind: "baths", value: filters.baths, label: `${filters.baths}+ baths`, clear: () => update({ baths: 0 }) },
    filters.availability && { key: "availability", kind: "availability", value: filters.availability, label: filters.availability, clear: () => update({ availability: "" }) },
    ...filters.amenities.map((amenity) => ({ key: `amenity:${amenity}`, kind: "amenity", value: amenity, label: amenity, clear: () => update({ amenities: filters.amenities.filter((value) => value !== amenity) }) })),
    query.trim() && { key: "search", kind: "search", value: query.trim(), label: `“${query.trim()}”`, clear: () => update({ query: "" }, { replace: true }) },
  ].filter(Boolean);
  const hasFilters = activeFilters.length > 0 || Boolean(!fixedListingType && filters.listingType);
  // The banner also names Buy/Rent when it is a filter here (not on the fixed /sale and /rent pages)
  const bannerFilters = [
    !fixedListingType && filters.listingType && { key: "intent", kind: "intent", value: filters.listingType, label: filters.listingType === "Rent" ? "For rent" : "For sale", clear: () => update({ listingType: "" }) },
    ...activeFilters,
  ].filter(Boolean);
  const shortlistLink = <Link to="/account/saved" className="catalogue-shortlist"><Heart size={16} aria-hidden="true" />Your shortlist<ArrowUpRight size={15} aria-hidden="true" /></Link>;

  const goToPage = (next) => {
    update({ page: next });
    resultsRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  const pageNumbers = Array.from({ length: shown?.pages || 0 }, (_, index) => index + 1)
    .filter((number) => number === 1 || number === shown.pages || Math.abs(number - page) <= 1);

  return (
    <div className="property-catalogue">
      {banner ? (
        <ListingsBanner image={banner.image} crumb={title} title={banner.heading || title} description={description} filters={bannerFilters} onClearAll={clear} aside={shortlistLink} />
      ) : (
      <header className="catalogue-heading">
        <div className="container-page">
          <nav aria-label="Breadcrumb" className="catalogue-breadcrumb"><Link to="/">Home</Link><ChevronRight size={12} aria-hidden="true" /><span>{title}</span></nav>
          <div className="catalogue-heading-row">
            <div><h1>{words.slice(0, -1).join(" ")} <span>{words.at(-1)}</span><span className="catalogue-title-stop">.</span></h1><p className="catalogue-description">{description}</p></div>
            {shortlistLink}
          </div>
        </div>
      </header>
      )}

      <div className="catalogue-controls">
        <div className="container-page catalogue-controls-inner">
          <fieldset className="catalogue-intents">
            <legend className="sr-only">I’m looking to</legend>
            {INTENTS.map(({ value, label, icon: Icon }) => {
              const count = value === "Sale" ? allFacets.data?.sale : value === "Rent" ? allFacets.data?.rent : allFacets.data?.total;
              return (
                <label key={label} className={`catalogue-intent ${filters.listingType === value ? "is-active" : ""}`}>
                  <input type="radio" className="sr-only" name="catalogue-intent" value={value} checked={filters.listingType === value} onChange={() => changeIntent(value)} />
                  <Icon size={15} aria-hidden="true" /><span className="catalogue-intent-label">{label}</span>{count !== undefined && <small>{count}</small>}
                </label>
              );
            })}
          </fieldset>
          <div className="catalogue-search-row">
            <form role="search" onSubmit={(event) => event.preventDefault()} className="catalogue-search">
              <Search size={18} aria-hidden="true" />
              <input type="search" aria-label="Search properties" placeholder="Search a home, neighbourhood or type" value={query} onChange={(event) => update({ query: event.target.value }, { replace: true })} />
              {query && <button type="button" aria-label="Clear search" onClick={() => update({ query: "" }, { replace: true })}><X size={16} aria-hidden="true" /></button>}
            </form>
            <button type="button" className="catalogue-filter-trigger" aria-label={activeFilters.length ? `Filters, ${activeFilters.length} active` : "Filters"} onClick={() => setIsFilterOpen(true)}><SlidersHorizontal size={18} aria-hidden="true" /><span>Filters</span>{activeFilters.length > 0 && <small>{activeFilters.length}</small>}</button>
          </div>
        </div>
      </div>

      <div className="container-page catalogue-layout">
        <aside className="catalogue-sidebar" aria-label="Property filters">
          <div className="catalogue-sidebar-inner">
            <div className="catalogue-sidebar-heading">
              <div className="catalogue-filter-intro"><span className="catalogue-filter-emblem"><SlidersHorizontal size={20} aria-hidden="true" /></span><span className="catalogue-eyebrow">A HOME THAT FITS YOU</span></div>
              <div className="catalogue-filter-title"><h2>Find your fit<span>.</span></h2><button type="button" onClick={clear} className="catalogue-reset" disabled={!hasFilters} aria-label="Reset filters"><RotateCcw size={13} aria-hidden="true" />Reset</button></div>
              <p>Choose the details that make a place yours.</p>
              {activeFilters.length > 0 && <span className="catalogue-filter-applied">{activeFilters.length} {activeFilters.length === 1 ? "filter" : "filters"} applied</span>}
            </div>
            <PropertyFilterPanel filters={filters} update={update} facets={facets} />
            <Link to={paths.agents} className="catalogue-sidebar-note"><span>KNOW THE NEIGHBOURHOOD</span><strong>A little local insight?</strong><p>Connect with an agent who knows the area.</p><span className="catalogue-agent-link">Explore agents<ArrowUpRight size={16} aria-hidden="true" /></span></Link>
          </div>
        </aside>

        <section ref={resultsRef} className="catalogue-results" aria-label="Property results">
          <NearbyBar
            near={near} locating={locating} problem={locationProblem} view={view}
            onView={(next) => update({ view: next === "map" ? "map" : "", page })}
            onSelectPlace={selectPlace} onUseDevice={useDevice} onRadius={(radius) => update({ radius })} onClear={clearLocation}
            searchInputRef={locationInputRef} changing={changingLocation} onChanging={setChangingLocation}
          />
          <div className="catalogue-results-heading">
            <div className="catalogue-result-count" role="status" aria-live="polite">
              <h2>{firstLoad ? "Finding homes…" : results.error ? "Your search" : <><strong>{total}</strong> {total === 1 ? "home" : "homes"}{filters.listingType === "Sale" ? " for sale" : filters.listingType === "Rent" ? " to rent" : nearbyActive ? "" : " to explore"}{nearbyActive && ` ${describeSearchArea(near)}`}</>}</h2>
              <p>{pending && !firstLoad ? "Updating your results…" : showMap ? (total > MAP_MARKER_LIMIT ? `The ${MAP_MARKER_LIMIT} nearest are on the map. Narrow the radius or filters to see the rest.` : "Select a price on the map to preview the home.") : total ? `Showing ${first}–${last} · ${nearbyActive ? "Nearest first unless you sort otherwise." : "Find the one that fits."}` : "Your next chapter starts here."}</p>
            </div>
            <div className="catalogue-sort"><label htmlFor="catalogue-sort">Sort by</label><div className="catalogue-select-wrap"><select id="catalogue-sort" aria-label="Sort properties" value={sort} onChange={(event) => update({ sort: event.target.value })}>{(nearbyActive ? NEARBY_SORTS : SORTS).map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></div></div>
          </div>

          {activeFilters.length > 0 && <div className="catalogue-active-filters" aria-label="Selected filters">{activeFilters.map((filter) => <button key={filter.key} type="button" onClick={filter.clear} aria-label={`Remove ${filter.label} filter`}>{filter.label}<X size={12} aria-hidden="true" /></button>)}<button type="button" onClick={clear} className="catalogue-clear-all">Clear all</button></div>}

          {showMap ? (
            <Suspense fallback={<div className="discovery-map discovery-map-canvas grid place-items-center text-sm text-gray-500" role="status">Loading the map…</div>}>
              <DiscoveryMap
                center={near} radius={near.radius} markers={shownMarkers?.items || []}
                loading={markers.loading} error={markers.error} onRetry={markers.reload} onSearchArea={searchMapArea}
              />
            </Suspense>
          ) : results.error ? (
            <div role="alert" className="catalogue-message"><AlertCircle size={30} strokeWidth={1.4} aria-hidden="true" /><h3>We couldn’t load the homes.</h3><p>Please try again in a moment.</p><button type="button" onClick={results.reload} className="catalogue-primary">Try again</button></div>
          ) : firstLoad ? <SkeletonGrid count={6} className="catalogue-grid catalogue-skeletons" /> : !shown?.items.length && nearbyActive ? (
            <div className="catalogue-message"><MapPin size={34} strokeWidth={1.3} aria-hidden="true" /><h3>No properties found around this location.</h3><p>Try a wider radius, another location or fewer filters.</p>
              {widerRadius(near.radius) && <button type="button" onClick={() => update({ radius: widerRadius(near.radius) })} className="catalogue-primary">Expand to {widerRadius(near.radius)} km</button>}
              <button type="button" onClick={changeLocation} className="catalogue-reset">Change location</button>
              {activeFilters.length > 0 && <button type="button" onClick={clear} className="catalogue-reset">Remove filters</button>}
            </div>
          ) : !shown?.items.length ? (
            <div className="catalogue-message"><House size={34} strokeWidth={1.3} aria-hidden="true" /><h3>{facets.data?.total === 0 ? "New homes are on their way." : "A little room to rethink your search."}</h3><p>{facets.data?.total === 0 ? "Check back for homes as they become available." : "Try a different area, a wider budget or fewer filters."}</p>{hasFilters && <button type="button" onClick={clear} className="catalogue-primary">Clear all filters</button>}{page > 1 && <button type="button" onClick={() => goToPage(1)} className="catalogue-reset">Back to the first page</button>}</div>
          ) : <div className={`catalogue-grid ${pending ? "is-loading" : ""}`} aria-busy={pending}>{shown.items.map((house) => <HouseCard key={house.id} house={house} />)}</div>}

          {!showMap && !results.error && shown?.pages > 1 && <nav aria-label="Pagination" className="catalogue-pagination">
            <p>Page {shownPage} of {shown.pages}</p>
            <div><button type="button" onClick={() => goToPage(page - 1)} disabled={pending || page <= 1} aria-label="Previous page"><ChevronLeft size={17} aria-hidden="true" /></button>{pageNumbers.map((number, index) => <span key={number}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span className="catalogue-page-gap">…</span>}<button type="button" onClick={() => goToPage(number)} aria-label={`Page ${number}`} aria-current={page === number ? "page" : undefined} disabled={pending}>{number}</button></span>)}<button type="button" onClick={() => goToPage(page + 1)} disabled={pending || page >= shown.pages} aria-label="Next page"><ChevronRight size={17} aria-hidden="true" /></button></div>
          </nav>}

          <div className="catalogue-help"><div><span className="catalogue-eyebrow">A LITTLE LOCAL KNOWLEDGE</span><p>Find the home. Get to know the neighbourhood.</p></div><Link to={paths.agents}>Talk to an agent<ArrowUpRight size={17} aria-hidden="true" /></Link></div>
        </section>
      </div>

      <PropertyFilterDialog open={isFilterOpen} onClose={() => setIsFilterOpen(false)} filters={filters} update={update} facets={facets} clear={clear} total={total} pending={pending} />
    </div>
  );
};

export default PropertyBrowser;
