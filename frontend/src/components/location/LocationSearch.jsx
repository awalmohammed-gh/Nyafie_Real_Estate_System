import { useEffect, useId, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import { geoApi } from "../../frontApi";
import "./location.css";

/**
 * "Search by city, neighbourhood or location…" with suggestions from the place search API.
 * onSelect({ source: "place", label, latitude, longitude }) for a place;
 * onUseDevice() for "Use my current location" (shown unless allowDevice is false).
 * Lookups are debounced, and an outdated lookup is cancelled so it can never replace a newer one.
 */
const LocationSearch = ({ onSelect, onUseDevice, allowDevice = true, deviceBusy = false, purpose = "place", near, placeholder = "Search by city, neighborhood or location…", initialQuery = "", autoFocus = false, className = "", inputRef: externalRef }) => {
  const id = useId();
  const localRef = useRef(null);
  const inputRef = externalRef || localRef;
  const wrapper = useRef(null);
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [result, setResult] = useState({ query: "", places: [], error: "" });
  const [attempt, setAttempt] = useState(0);
  const trimmed = query.trim();
  const searching = trimmed.length >= 2 && result.query !== trimmed;

  useEffect(() => {
    if (trimmed.length < 2) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      geoApi.searchPlaces(trimmed, { purpose, near, signal: controller.signal }).then(
        (places) => setResult({ query: trimmed, places, error: "" }),
        (error) => !controller.signal.aborted && setResult({ query: trimmed, places: [], error: error.message || "Location search is unavailable right now." }),
      );
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
    // near only ranks results; changing it shouldn't re-run a finished search
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, purpose, attempt]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => { if (!wrapper.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const places = trimmed.length >= 2 && result.query === trimmed ? result.places : [];
  const options = [
    ...(allowDevice && onUseDevice ? [{ id: "device", device: true, name: "Use my current location", description: "Find properties around where you are" }] : []),
    ...places,
  ];

  const choose = (option) => {
    setOpen(false);
    if (option.device) { onUseDevice?.(); return; }
    setQuery(option.label);
    onSelect?.({ source: "place", label: option.label, latitude: option.latitude, longitude: option.longitude });
  };

  const onKeyDown = (event) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { if (open) { event.preventDefault(); setOpen(false); } return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (options.length) setActive((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = open ? options[active] : null;
      // Enter on typed text picks the best match once it has loaded
      if (option) choose(option);
      else if (places[0]) choose(places[0]);
    }
  };

  const status = trimmed.length < 2 ? "" : searching ? "Searching places…" : result.error ? result.error : places.length ? `${places.length} ${places.length === 1 ? "place" : "places"} found` : `No places match “${trimmed}”.`;

  return (
    <div ref={wrapper} className={`location-search ${className}`}>
      <div className="location-search-field">
        <Search size={17} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Search for a location"
          aria-expanded={open && options.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(allowDevice && onUseDevice && event.target.value.trim().length >= 2 ? 1 : 0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {searching && <Loader2 size={16} className="location-spin" aria-hidden="true" />}
        {query && !searching && <button type="button" aria-label="Clear location search" onClick={() => { setQuery(""); setOpen(true); inputRef.current?.focus(); }}><X size={15} aria-hidden="true" /></button>}
      </div>
      {open && (options.length > 0 || status) && (
        <div className="location-search-panel">
          {options.length > 0 && (
            <ul id={`${id}-list`} role="listbox" aria-label="Locations">
              {options.map((option, index) => (
                <li key={option.id} id={`${id}-${index}`} role="option" aria-selected={active === index} data-active={active === index}
                  className={option.device ? "is-device" : ""} onPointerMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
                  <span className="location-option-icon">{option.device ? (deviceBusy ? <Loader2 size={16} className="location-spin" aria-hidden="true" /> : <Crosshair size={16} aria-hidden="true" />) : <MapPin size={16} aria-hidden="true" />}</span>
                  <span className="location-option-copy"><span>{option.name}</span>{option.description && <small>{option.description}</small>}</span>
                </li>
              ))}
            </ul>
          )}
          {status && <p role="status" className={`location-search-status ${result.error && !searching ? "is-error" : ""}`}>{status}{result.error && !searching && <button type="button" onClick={() => { setResult({ query: "", places: [], error: "" }); setAttempt((n) => n + 1); }}>Try again</button>}</p>}
          <p className="location-attribution">Place search © OpenStreetMap contributors</p>
        </div>
      )}
    </div>
  );
};

export default LocationSearch;
