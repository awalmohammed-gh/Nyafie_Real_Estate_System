import { useEffect, useId, useRef } from "react";
import {
  Bath,
  BedDouble,
  Building2,
  Check,
  ChevronDown,
  CircleCheck,
  MapPin,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { FEATURE_OPTIONS, PRICE_RANGES } from "../../hooks/usePropertyBrowseState";
import { useLockBodyScroll } from "../../hooks/useLockBodyScroll";
import { formatType } from "../../utils/property";

const FilterGroup = ({
  title,
  icon: Icon,
  summary,
  open = false,
  children,
}) => (
  <details className="catalogue-filter-group" open={open || undefined}>
    <summary>
      <span className="catalogue-group-icon">
        <Icon size={16} aria-hidden="true" />
      </span>
      <span>{title}</span>
      <span className="catalogue-group-summary">{summary}</span>
      <ChevronDown size={15} aria-hidden="true" />
    </summary>
    <div className="catalogue-filter-content">{children}</div>
  </details>
);

const RoomChoices = ({ label, icon: Icon, value, maximum, onChange }) => {
  const id = useId();
  const values = Array.from({ length: maximum + 1 }, (_, index) => index);
  if (value > maximum) values.push(value);
  return (
    <fieldset className="catalogue-room-choice">
      <legend>
        <Icon size={15} aria-hidden="true" />
        {label}
      </legend>
      <div>
        {values.map((count) => (
          <label key={count} className={value === count ? "is-selected" : ""}>
            <input
              type="radio"
              className="sr-only"
              name={id}
              value={count}
              checked={value === count}
              onChange={() => onChange(count)}
            />
            <span>{count ? `${count}+` : "Any"}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
};

const FilterSelect = ({ label, name, value, onChange, disabled, children }) => {
  const id = useId();
  return (
    <div className="catalogue-select-field">
      <label htmlFor={id}>{label}</label>
      <div className="catalogue-select-wrap">
        <select
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
        >
          {children}
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </div>
    </div>
  );
};

export const PropertyFilterPanel = ({ filters, update, facets }) => {
  const options = facets.data;
  const bounds = Object.values(options?.priceRange || {});
  const ranges = PRICE_RANGES.filter((range) =>
    bounds.some(
      (bound) =>
        bound.maxPrice >= range.min &&
        (range.max === null || bound.minPrice <= range.max),
    ),
  );
  const priceIndex = filters.price
    ? PRICE_RANGES.findIndex(
        (range) =>
          range.min === (filters.price.min ?? 0) &&
          range.max === filters.price.max,
      )
    : -1;
  const budgetValue = !filters.price
    ? ""
    : priceIndex < 0
      ? "custom"
      : String(priceIndex);
  const samePlace = (a, b) => a?.toLowerCase() === b?.toLowerCase();
  const cities = (options?.cities || []).filter(
    (city) => !filters.region || samePlace(city.region, filters.region),
  );
  const areas = (options?.areas || []).filter(
    (area) =>
      (!filters.region || samePlace(area.region, filters.region)) &&
      (!filters.city || samePlace(area.city, filters.city)),
  );

  return (
    <div className="catalogue-filter-panel">
      {facets.error && (
        <div role="status" className="catalogue-facet-error">
          Options couldn’t load.{" "}
          <button type="button" onClick={facets.reload}>
            Try again
          </button>
        </div>
      )}
      <FilterGroup
        title="Location"
        icon={MapPin}
        summary={
          filters.area || filters.city || filters.region
            ? "Selected"
            : "Anywhere"
        }
        open
      >
        <p className="catalogue-group-description">
          Start with a neighborhood you love.
        </p>
        <FilterSelect
          label="Region"
          name="region"
          value={filters.region}
          disabled={facets.loading}
          onChange={(event) =>
            update({ region: event.target.value, city: "", area: "" })
          }
        >
          <option value="">All regions</option>
          {filters.region &&
            !options?.regions?.some(
              (region) => region.name === filters.region,
            ) && <option value={filters.region}>{filters.region}</option>}
          {(options?.regions || []).map((region) => (
            <option key={region.name} value={region.name}>
              {region.name} ({region.count})
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="City / town"
          name="city"
          value={filters.city}
          disabled={facets.loading}
          onChange={(event) => update({ city: event.target.value, area: "" })}
        >
          <option value="">All cities</option>
          {filters.city &&
            !cities.some((city) => city.name === filters.city) && (
              <option value={filters.city}>{filters.city}</option>
            )}
          {cities.map((city) => (
            <option key={`${city.region}:${city.name}`} value={city.name}>
              {city.name} ({city.count})
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Neighborhood"
          name="area"
          value={filters.area}
          disabled={facets.loading}
          onChange={(event) => update({ area: event.target.value })}
        >
          <option value="">
            {facets.loading ? "Loading locations…" : "All locations"}
          </option>
          {filters.area &&
            !areas.some((area) => area.name === filters.area) && (
              <option value={filters.area}>{filters.area}</option>
            )}
          {areas.map((area) => (
            <option key={area.name} value={area.name}>
              {area.name} ({area.count})
            </option>
          ))}
        </FilterSelect>
      </FilterGroup>

      <FilterGroup title="Budget" icon={Wallet} summary="GHS" open>
        <p className="catalogue-group-description">
          A comfortable space. A comfortable price.
        </p>
        <FilterSelect
          label="Price range · GHS"
          name="budget"
          value={budgetValue}
          disabled={facets.loading}
          onChange={(event) =>
            update({
              price: event.target.value
                ? PRICE_RANGES[Number(event.target.value)]
                : null,
            })
          }
        >
          <option value="">Any price</option>
          {budgetValue === "custom" && (
            <option value="custom">{filters.price.label}</option>
          )}
          {ranges.map((range) => (
            <option
              key={range.label}
              value={String(PRICE_RANGES.indexOf(range))}
            >
              {range.label}
            </option>
          ))}
          {priceIndex >= 0 && !ranges.includes(PRICE_RANGES[priceIndex]) && (
            <option value={String(priceIndex)}>{filters.price.label}</option>
          )}
        </FilterSelect>
        {filters.listingType === "Rent" && (
          <p className="catalogue-filter-hint">
            Rental prices are per night or month, as shown on each home.
          </p>
        )}
      </FilterGroup>

      <FilterGroup title="Rooms" icon={BedDouble} open>
        <div className="catalogue-room-fields">
          <RoomChoices
            label="Bedrooms"
            icon={BedDouble}
            value={filters.beds}
            maximum={5}
            onChange={(beds) => update({ beds })}
          />
          <RoomChoices
            label="Bathrooms"
            icon={Bath}
            value={filters.baths}
            maximum={4}
            onChange={(baths) => update({ baths })}
          />
        </div>
      </FilterGroup>

      <FilterGroup
        title="Property type"
        icon={Building2}
        summary={
          filters.types.length ? `${filters.types.length} selected` : "Any"
        }
      >
        {facets.loading ? (
          <p className="catalogue-filter-hint">Loading property types…</p>
        ) : !options?.types?.length ? (
          <p className="catalogue-filter-hint">No property types available.</p>
        ) : (
          <div className="catalogue-type-options">
            {options.types.map((type) => (
              <label key={type.value} className="catalogue-checkbox">
                <input
                  type="checkbox"
                  checked={filters.types.includes(type.value)}
                  onChange={() =>
                    update({
                      types: filters.types.includes(type.value)
                        ? filters.types.filter((value) => value !== type.value)
                        : [...filters.types, type.value],
                    })
                  }
                />
                <span className="catalogue-type-check">
                  <Check size={12} aria-hidden="true" />
                </span>
                <span>{formatType(type.value)}</span>
                <small>{type.count}</small>
              </label>
            ))}
          </div>
        )}
      </FilterGroup>

      <FilterGroup
        title="Availability"
        icon={CircleCheck}
        summary={filters.availability || "Any"}
      >
        <FilterSelect
          label="Listing availability"
          name="availability"
          value={filters.availability}
          onChange={(event) => update({ availability: event.target.value })}
        >
          <option value="">Any availability</option>
          <option value="Available">Available</option>
          <option value="Under Offer">Under offer</option>
        </FilterSelect>
      </FilterGroup>

      <FilterGroup
        title="Features"
        icon={Sparkles}
        summary={filters.amenities.length ? `${filters.amenities.length} selected` : "Any"}
      >
        <div className="catalogue-type-options">
          {FEATURE_OPTIONS.map((feature) => (
            <label key={feature} className="catalogue-checkbox">
              <input
                type="checkbox"
                checked={filters.amenities.includes(feature)}
                onChange={() =>
                  update({
                    amenities: filters.amenities.includes(feature)
                      ? filters.amenities.filter((value) => value !== feature)
                      : [...filters.amenities, feature],
                  })
                }
              />
              <span className="catalogue-type-check">
                <Check size={12} aria-hidden="true" />
              </span>
              <span>{feature}</span>
            </label>
          ))}
        </div>
      </FilterGroup>
    </div>
  );
};

// Native modal dialogs keep focus inside, make the background inert, and restore
// the trigger on close. They also work with Escape and mobile screen readers.
export const PropertyFilterDialog = ({
  open,
  onClose,
  filters,
  update,
  facets,
  clear,
  total,
  pending,
}) => {
  const ref = useRef(null);
  const titleId = useId();
  useLockBodyScroll(open);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="catalogue-filter-dialog"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <div className="catalogue-dialog-heading">
        <div>
          <p className="catalogue-eyebrow">MAKE IT YOURS</p>
          <h2 id={titleId}>Refine your search</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filters"
          className="catalogue-icon-button"
        >
          <X size={21} aria-hidden="true" />
        </button>
      </div>
      <div className="catalogue-dialog-content">
        <PropertyFilterPanel
          filters={filters}
          update={update}
          facets={facets}
        />
      </div>
      <div className="catalogue-dialog-footer">
        <button type="button" onClick={clear} className="catalogue-reset">
          Reset all
        </button>
        <button type="button" onClick={onClose} className="catalogue-primary">
          <SlidersHorizontal size={16} aria-hidden="true" />
          {pending
            ? "Show results"
            : `Show ${total} ${total === 1 ? "home" : "homes"}`}
        </button>
      </div>
    </dialog>
  );
};
