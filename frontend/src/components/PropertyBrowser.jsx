import { useState } from 'react';
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Home, Search, SlidersHorizontal, X } from 'lucide-react';
import HouseCard from './card/HouseCard';
import PageHeader from './ui/PageHeader';
import CtaBanner from './ui/CtaBanner';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { useRealEstate } from '../context/useRealEstate';
import SkeletonGrid from './ui/SkeletonGrid';
import { formatType, getPrice } from '../utils/property';

// Non-overlapping, sorted price buckets (GHS). Only buckets that contain at
// least one of the current properties are shown.
const PRICE_RANGES = [
  { label: "Up to ₵2,000", min: 0, max: 2000 },
  { label: "₵2,001 - ₵5,000", min: 2001, max: 5000 },
  { label: "₵200k - ₵400k", min: 200000, max: 400000 },
  { label: "₵400k - ₵700k", min: 400001, max: 700000 },
  { label: "₵700k - ₵900k", min: 700001, max: 900000 },
];

const BEDROOM_OPTIONS = [0, 1, 2, 3, 4];

const sorters = {
  latest: null,
  priceAsc: (a, b) => getPrice(a) - getPrice(b),
  priceDesc: (a, b) => getPrice(b) - getPrice(a),
  popular: (a, b) => (b.meta?.views || 0) - (a.meta?.views || 0),
  rating: (a, b) => (b.meta?.rating || 0) - (a.meta?.rating || 0),
};

const Chip = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition ${
      active
        ? "bg-brand-500 text-white shadow-md shadow-brand-500/25"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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

const emptyFilters = { status: "", types: [], area: "", price: null, beds: 0 };

const PropertyBrowser = ({ properties, title, description, heroImage = '/listBg.jpg', crumbs, initialFilters = {} }) => {
  const [filters, setFilters] = useState({ ...emptyFilters, ...initialFilters });
  const [query, setQuery] = useState(initialFilters.query || "");
  const [sortBy, setSortBy] = useState('latest');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const { propertiesLoading } = useRealEstate();

  useLockBodyScroll(isFilterOpen);

  const statuses = [...new Set(properties.map((p) => p.property.status))];
  const types = [...new Set(properties.map((p) => p.property.type))].sort();
  const areas = [...new Set(properties.map((p) => p.location.name))].sort();
  const priceRanges = PRICE_RANGES.filter((range) =>
    properties.some((p) => getPrice(p) >= range.min && getPrice(p) <= range.max)
  );

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const toggleType = (type) =>
    setFilter("types", filters.types.includes(type) ? filters.types.filter((t) => t !== type) : [...filters.types, type]);

  const search = query.trim().toLowerCase();
  const filteredProperties = properties.filter((property) => {
    const price = getPrice(property);
    return (
      (!filters.status || property.property.status === filters.status) &&
      (!filters.types.length || filters.types.includes(property.property.type)) &&
      (!filters.area || property.location.name === filters.area) &&
      (!filters.price || (price >= filters.price.min && price <= filters.price.max)) &&
      (!filters.beds || (property.property.bedrooms || 0) >= filters.beds) &&
      (!search ||
        [property.title, property.location.name, property.location.city, property.property.type]
          .join(" ")
          .toLowerCase()
          .includes(search))
    );
  });

  if (sorters[sortBy]) filteredProperties.sort(sorters[sortBy]);

  const activeFilters = [
    filters.status && { key: "status", label: filters.status === "Sale" ? "For Sale" : "For Rent", clear: () => setFilter("status", "") },
    ...filters.types.map((type) => ({ key: type, label: formatType(type), clear: () => toggleType(type) })),
    filters.area && { key: "area", label: filters.area, clear: () => setFilter("area", "") },
    filters.price && { key: "price", label: filters.price.label, clear: () => setFilter("price", null) },
    filters.beds && { key: "beds", label: `${filters.beds}+ beds`, clear: () => setFilter("beds", 0) },
    search && { key: "query", label: `"${query.trim()}"`, clear: () => setQuery("") },
  ].filter(Boolean);

  const clearFilters = () => {
    setFilters(emptyFilters);
    setQuery("");
  };

  const filterPanel = (
    <>
      {statuses.length > 1 && (
        <FilterGroup title="Status">
          <Chip active={!filters.status} onClick={() => setFilter("status", "")}>All</Chip>
          {statuses.map((status) => (
            <Chip key={status} active={filters.status === status} onClick={() => setFilter("status", status)}>
              For {status}
            </Chip>
          ))}
        </FilterGroup>
      )}

      <FilterGroup title="Property type">
        {types.map((type) => (
          <Chip key={type} active={filters.types.includes(type)} onClick={() => toggleType(type)}>
            {formatType(type)}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup title="Location">
        <div className="relative w-full">
          <select
            value={filters.area}
            onChange={(e) => setFilter("area", e.target.value)}
            className="field appearance-none pr-10"
          >
            <option value="">All locations</option>
            {areas.map((area) => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </FilterGroup>

      <FilterGroup title="Price range">
        <Chip active={!filters.price} onClick={() => setFilter("price", null)}>Any price</Chip>
        {priceRanges.map((range) => (
          <Chip key={range.label} active={filters.price?.label === range.label} onClick={() => setFilter("price", range)}>
            {range.label}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup title="Bedrooms">
        {BEDROOM_OPTIONS.map((beds) => (
          <Chip key={beds} active={filters.beds === beds} onClick={() => setFilter("beds", beds)}>
            {beds === 0 ? "Any" : `${beds}+`}
          </Chip>
        ))}
      </FilterGroup>
    </>
  );

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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, area or type..."
              aria-label="Search properties"
              className="field rounded-full py-3.5 pl-12"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setIsFilterOpen(true)}
              className="btn btn-light flex-1 lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilters.length > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-xs text-white">
                  {activeFilters.length}
                </span>
              )}
            </button>
            <div className="relative flex-1 sm:flex-none">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort properties"
                className="field appearance-none rounded-full py-3.5 pr-10 font-semibold sm:w-52"
              >
                <option value="latest">Sort: Latest</option>
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
                  <button onClick={clearFilters} className="text-sm font-semibold text-brand-600 hover:text-brand-800">
                    Clear all
                  </button>
                )}
              </div>
              {filterPanel}
            </div>
          </aside>

          {/* Results */}
          <div className="min-w-0 flex-1">
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <p className="mr-2 text-sm text-gray-600">
                <span className="font-bold text-gray-900">{filteredProperties.length}</span>{" "}
                {filteredProperties.length === 1 ? "property" : "properties"} found
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

            {propertiesLoading ? (
              <SkeletonGrid className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3" />
            ) : filteredProperties.length > 0 ? (
              <motion.div layout className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {filteredProperties.map((property) => (
                    <motion.div
                      key={property.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.25 }}
                      className="h-full"
                    >
                      <HouseCard house={property} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            ) : (
              <div className="rounded-3xl bg-gray-50 px-6 py-20 text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white text-gray-400 shadow-sm">
                  <Home className="h-8 w-8" />
                </span>
                <h3 className="mt-5 text-lg font-bold text-gray-900">No properties match your filters</h3>
                <p className="mt-1 text-gray-500">Try removing a filter or searching for something else.</p>
                <button onClick={clearFilters} className="btn btn-primary mt-6">
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <CtaBanner />

      {/* Mobile filter sheet */}
      <AnimatePresence>
        {isFilterOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFilterOpen(false)}
              className="absolute inset-0 bg-gray-950/50 backdrop-blur-sm"
            />
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
                <button
                  onClick={() => setIsFilterOpen(false)}
                  aria-label="Close filters"
                  className="grid h-10 w-10 place-items-center rounded-full hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-6">{filterPanel}</div>
              <div className="flex gap-3 border-t border-gray-100 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <button onClick={clearFilters} className="btn btn-light flex-1">
                  Clear all
                </button>
                <button onClick={() => setIsFilterOpen(false)} className="btn btn-primary flex-2">
                  Show {filteredProperties.length} {filteredProperties.length === 1 ? "result" : "results"}
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
