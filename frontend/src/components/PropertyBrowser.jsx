import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Home, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import HouseCard from './card/HouseCard';
import PageHeader from './ui/PageHeader';
import CtaBanner from './ui/CtaBanner';
import SkeletonGrid from './ui/SkeletonGrid';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { useApiQuery } from '../hooks/useApiQuery';
import { propertyApi } from '../frontApi';
import { formatType } from '../utils/property';

const PAGE_SIZE = 12;

// Price buckets (GHS). Only buckets that overlap the real prices in the database are shown.
const PRICE_RANGES = [
  { label: "Up to ₵2,000", min: 0, max: 2000 },
  { label: "₵2,001 - ₵5,000", min: 2001, max: 5000 },
  { label: "₵5,001 - ₵200k", min: 5001, max: 200000 },
  { label: "₵200k - ₵400k", min: 200001, max: 400000 },
  { label: "₵400k - ₵700k", min: 400001, max: 700000 },
  { label: "₵700k+", min: 700001, max: null },
];
const ROOM_OPTIONS = [0, 1, 2, 3, 4];
const AVAILABILITY = ["Available", "Under Offer"];

const Chip = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition ${
      active ? "bg-brand-500 text-white shadow-md shadow-brand-500/25" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`}
  >
    {children}
  </button>
);

const FilterGroup = ({ title, children }) => (
  <div className="border-b border-gray-100 py-6 first:pt-0 last:border-0 last:pb-0">
    <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

const emptyFilters = { listingType: "", types: [], area: "", price: null, beds: 0, baths: 0, availability: "" };

// Waits until typing pauses before searching, so each keystroke isn't a request
const useDebounced = (value, delay = 350) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

/**
 * Property search and listing (MongoDB -> API -> here). Filtering, search, sorting and
 * pagination all run on the server; this component only holds the chosen filters.
 * fixedListingType: "Sale" | "Rent" for the /sale and /rent pages.
 */
const PropertyBrowser = ({ title, description, heroImage = '/listBg.jpg', crumbs, initialFilters = {}, fixedListingType }) => {
  const [filters, setFilters] = useState({ ...emptyFilters, ...initialFilters });
  const [query, setQuery] = useState(initialFilters.query || "");
  const [sortBy, setSortBy] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const search = useDebounced(query.trim());
  useLockBodyScroll(isFilterOpen);

  const listingType = fixedListingType || filters.listingType;
  const params = {
    page,
    limit: PAGE_SIZE,
    search,
    listingType,
    type: filters.types,
    area: filters.area,
    minPrice: filters.price?.min || undefined,
    maxPrice: filters.price?.max ?? undefined,
    bedrooms: filters.beds || undefined,
    bathrooms: filters.baths || undefined,
    availability: filters.availability,
    sort: sortBy,
  };
  const results = useApiQuery(JSON.stringify(params), () => propertyApi.searchProperties(params));
  const facets = useApiQuery(`facets:${fixedListingType || ""}`, () => propertyApi.getPropertyFacets({ listingType: fixedListingType }));

  // Filter options come from the database; price buckets only where listings exist
  const options = facets.data || facets.previous;
  const priceBounds = Object.entries(options?.priceRange || {})
    .filter(([type]) => !listingType || type === listingType)
    .map(([, r]) => r);
  const priceRanges = PRICE_RANGES.filter((range) => priceBounds.some((b) => b.maxPrice >= range.min && (range.max === null || b.minPrice <= range.max)));

  // Any filter change goes back to page 1
  const update = (changes) => {
    setFilters((prev) => ({ ...prev, ...changes }));
    setPage(1);
  };
  const toggleType = (type) => update({ types: filters.types.includes(type) ? filters.types.filter((t) => t !== type) : [...filters.types, type] });
  const onSearch = (value) => {
    setQuery(value);
    setPage(1);
  };

  const activeFilters = [
    !fixedListingType && filters.listingType && { key: "listingType", label: filters.listingType === "Sale" ? "For Sale" : "For Rent", clear: () => update({ listingType: "" }) },
    ...filters.types.map((type) => ({ key: type, label: formatType(type), clear: () => toggleType(type) })),
    filters.area && { key: "area", label: filters.area, clear: () => update({ area: "" }) },
    filters.price && { key: "price", label: filters.price.label, clear: () => update({ price: null }) },
    filters.beds && { key: "beds", label: `${filters.beds}+ beds`, clear: () => update({ beds: 0 }) },
    filters.baths && { key: "baths", label: `${filters.baths}+ baths`, clear: () => update({ baths: 0 }) },
    filters.availability && { key: "availability", label: filters.availability, clear: () => update({ availability: "" }) },
    query.trim() && { key: "query", label: `"${query.trim()}"`, clear: () => onSearch("") },
  ].filter(Boolean);

  const clearFilters = () => {
    setFilters(emptyFilters);
    setQuery("");
    setPage(1);
  };

  const shown = results.data || results.previous; // previous page stays visible (dimmed) while the next loads
  const firstLoad = results.loading && !results.previous;
  const total = shown?.total ?? 0;
  const noListingsAtAll = options && options.total === 0;

  const goToPage = (next) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filterPanel = (
    <>
      {!fixedListingType && (
        <FilterGroup title="Status">
          <Chip active={!filters.listingType} onClick={() => update({ listingType: "" })}>All</Chip>
          <Chip active={filters.listingType === "Sale"} onClick={() => update({ listingType: "Sale" })}>For Sale</Chip>
          <Chip active={filters.listingType === "Rent"} onClick={() => update({ listingType: "Rent" })}>For Rent</Chip>
        </FilterGroup>
      )}

      {options?.types?.length > 0 && (
        <FilterGroup title="Property type">
          {options.types.map((type) => (
            <Chip key={type.value} active={filters.types.includes(type.value)} onClick={() => toggleType(type.value)}>
              {formatType(type.value)}
            </Chip>
          ))}
        </FilterGroup>
      )}

      <FilterGroup title="Location">
        <div className="relative w-full">
          <select value={filters.area} onChange={(e) => update({ area: e.target.value })} aria-label="Location" className="field appearance-none pr-10">
            <option value="">All locations</option>
            {(options?.areas || []).map((area) => (
              <option key={area.name} value={area.name}>{area.name} ({area.count})</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </FilterGroup>

      {priceRanges.length > 0 && (
        <FilterGroup title="Price range">
          <Chip active={!filters.price} onClick={() => update({ price: null })}>Any price</Chip>
          {priceRanges.map((range) => (
            <Chip key={range.label} active={filters.price?.label === range.label} onClick={() => update({ price: range })}>
              {range.label}
            </Chip>
          ))}
        </FilterGroup>
      )}

      <FilterGroup title="Bedrooms">
        {ROOM_OPTIONS.map((beds) => (
          <Chip key={beds} active={filters.beds === beds} onClick={() => update({ beds })}>
            {beds === 0 ? "Any" : `${beds}+`}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup title="Bathrooms">
        {ROOM_OPTIONS.slice(0, 4).map((baths) => (
          <Chip key={baths} active={filters.baths === baths} onClick={() => update({ baths })}>
            {baths === 0 ? "Any" : `${baths}+`}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup title="Availability">
        <Chip active={!filters.availability} onClick={() => update({ availability: "" })}>Any</Chip>
        {AVAILABILITY.map((a) => (
          <Chip key={a} active={filters.availability === a} onClick={() => update({ availability: a })}>
            {a}
          </Chip>
        ))}
      </FilterGroup>
    </>
  );

  let body;
  if (results.error) {
    body = (
      <div role="alert" className="rounded-3xl bg-red-50 px-6 py-16 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-red-500 shadow-sm">
          <AlertTriangle className="h-7 w-7" />
        </span>
        <h3 className="mt-5 text-lg font-bold text-gray-900">Unable to load properties</h3>
        <p className="mt-1 text-gray-600">Something went wrong while loading the properties.</p>
        <button onClick={results.reload} className="btn btn-primary mt-6">
          <RotateCcw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  } else if (firstLoad) {
    body = <SkeletonGrid className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3" count={6} />;
  } else if (!shown?.items.length) {
    body = (
      <div className="rounded-3xl bg-gray-50 px-6 py-20 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white text-gray-400 shadow-sm">
          <Home className="h-8 w-8" />
        </span>
        {noListingsAtAll ? (
          <>
            <h3 className="mt-5 text-lg font-bold text-gray-900">No properties available</h3>
            <p className="mt-1 text-gray-500">Properties added to the system will appear here.</p>
          </>
        ) : (
          <>
            <h3 className="mt-5 text-lg font-bold text-gray-900">No properties match your filters</h3>
            <p className="mt-1 text-gray-500">Try removing a filter or searching for something else.</p>
            <button onClick={clearFilters} className="btn btn-primary mt-6">Clear all filters</button>
          </>
        )}
      </div>
    );
  } else {
    body = (
      <>
        <div className={`grid gap-6 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${results.loading ? "opacity-50" : ""}`} aria-busy={results.loading}>
          {shown.items.map((property) => (
            <motion.div key={property.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="h-full">
              <HouseCard house={property} />
            </motion.div>
          ))}
        </div>
        {shown.pages > 1 && (
          <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2">
            <button onClick={() => goToPage(page - 1)} disabled={page <= 1} aria-label="Previous page" className="btn btn-light h-11 w-11 p-0">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: shown.pages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === shown.pages || Math.abs(n - page) <= 1)
              .map((n, i, arr) => (
                <span key={n} className="flex items-center gap-2">
                  {i > 0 && n - arr[i - 1] > 1 && <span className="text-gray-400">…</span>}
                  <button
                    onClick={() => goToPage(n)}
                    aria-current={n === page ? "page" : undefined}
                    className={`grid h-11 min-w-11 place-items-center rounded-full px-3 text-sm font-semibold transition ${n === page ? "bg-brand-500 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"}`}
                  >
                    {n}
                  </button>
                </span>
              ))}
            <button onClick={() => goToPage(page + 1)} disabled={page >= shown.pages} aria-label="Next page" className="btn btn-light h-11 w-11 p-0">
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title={title} description={description} image={heroImage} crumbs={crumbs || [{ label: title }]} />

      <div className="container-page py-10 sm:py-14">
        {/* Toolbar */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search by name, area or type..."
              aria-label="Search properties"
              className="field rounded-full py-3.5 pl-12"
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setIsFilterOpen(true)} className="btn btn-light flex-1 lg:hidden">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilters.length > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-xs text-white">{activeFilters.length}</span>
              )}
            </button>
            <div className="relative flex-1 sm:flex-none">
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                aria-label="Sort properties"
                className="field appearance-none rounded-full py-3.5 pr-10 font-semibold sm:w-52"
              >
                <option value="">Sort: Recommended</option>
                <option value="latest">Newest first</option>
                <option value="priceAsc">Price: Low to High</option>
                <option value="priceDesc">Price: High to Low</option>
                <option value="popular">Most Popular</option>
                <option value="rating">Top Rated</option>
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Desktop sidebar */}
          <aside className="hidden w-72 shrink-0 lg:block">
            <div className="sticky top-28 rounded-3xl bg-white p-6 ring-1 ring-gray-200/80">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Filters</h2>
                {activeFilters.length > 0 && (
                  <button onClick={clearFilters} className="text-sm font-semibold text-brand-600 hover:text-brand-800">Clear all</button>
                )}
              </div>
              {filterPanel}
            </div>
          </aside>

          {/* Results */}
          <div className="min-w-0 flex-1">
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <p className="mr-2 text-sm text-gray-600" aria-live="polite">
                {results.error ? null : firstLoad ? (
                  "Loading properties…"
                ) : (
                  <>
                    <span className="font-bold text-gray-900">{total}</span> {total === 1 ? "property" : "properties"} found
                    {shown?.pages > 1 && <span className="text-gray-400"> · page {page} of {shown.pages}</span>}
                  </>
                )}
              </p>
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  onClick={filter.clear}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 capitalize transition hover:bg-brand-100"
                >
                  {filter.label}
                  <X className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
            {body}
          </div>
        </div>
      </div>

      <CtaBanner />

      {/* Mobile filter sheet */}
      <AnimatePresence>
        {isFilterOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsFilterOpen(false)} className="absolute inset-0 bg-gray-950/50 backdrop-blur-sm" />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Filters"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
              className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-3xl bg-white"
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <h2 className="text-lg font-bold text-gray-900">Filters</h2>
                <button onClick={() => setIsFilterOpen(false)} aria-label="Close filters" className="grid h-10 w-10 place-items-center rounded-full hover:bg-gray-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-6">{filterPanel}</div>
              <div className="flex gap-3 border-t border-gray-100 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <button onClick={clearFilters} className="btn btn-light flex-1">Clear all</button>
                <button onClick={() => setIsFilterOpen(false)} className="btn btn-primary flex-2">
                  {results.loading ? "Show results" : `Show ${total} ${total === 1 ? "result" : "results"}`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PropertyBrowser;
