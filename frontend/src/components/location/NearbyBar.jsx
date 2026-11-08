import { Crosshair, List, Loader2, Map as MapIcon, MapPin, Navigation, X } from "lucide-react";
import LocationSearch from "./LocationSearch";
import { SEARCH_RADII_KM } from "../../utils/geo";
import "./location.css";

/**
 * The listings page's location row.
 *  - No location: "Discover properties near you" with place search and "Use my current location".
 *  - A location: "Within [5 km] of East Legon" with Change, remove, and the List/Map switch.
 * problem: why the device position isn't available (denied, timeout...), shown with the search.
 */
const NearbyBar = ({ near, locating, problem, view, onView, onSelectPlace, onUseDevice, onRadius, onClear, searchInputRef, changing, onChanging: setChanging }) => {
  const showSearch = !near || near.pending || changing;

  return (
    <section className={`nearby-bar ${near && !near.pending ? "is-active" : ""}`} aria-label="Search location">
      {near && !near.pending && (
        <div className="nearby-bar-current">
          <span className={`nearby-bar-icon ${near.source === "device" ? "is-device" : ""}`}>{near.source === "device" ? <Navigation size={16} aria-hidden="true" /> : <MapPin size={16} aria-hidden="true" />}</span>
          <p>
            <span className="nearby-bar-eyebrow">Showing homes</span>
            <span className="nearby-bar-summary">
              within{" "}
              <label className="nearby-radius">
                <span className="sr-only">Search radius</span>
                <select value={near.radius} onChange={(event) => onRadius(Number(event.target.value))}>
                  {SEARCH_RADII_KM.map((km) => <option key={km} value={km}>{km} km</option>)}
                </select>
              </label>{" "}
              of <strong>{near.label}</strong>
            </span>
          </p>
          <div className="nearby-bar-actions">
            <button type="button" className="nearby-bar-link" onClick={() => setChanging((value) => !value)} aria-expanded={changing}>{changing ? "Cancel" : "Change location"}</button>
            <button type="button" className="nearby-bar-clear" onClick={onClear} aria-label="Stop searching near this location"><X size={15} aria-hidden="true" /></button>
          </div>
          <div className="nearby-view-toggle" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "list"} onClick={() => onView("list")}><List size={15} aria-hidden="true" />List</button>
            <button type="button" aria-pressed={view === "map"} onClick={() => onView("map")}><MapIcon size={15} aria-hidden="true" />Map</button>
          </div>
        </div>
      )}

      {showSearch && (
        <div className="nearby-bar-search">
          {!near && (
            <div className="nearby-bar-intro">
              <span className="nearby-bar-icon is-device"><Crosshair size={16} aria-hidden="true" /></span>
              <p><strong>Discover properties near you</strong><span>Search a neighbourhood or city, or use your current location. Your location is only used to find nearby homes.</span></p>
            </div>
          )}
          {near?.pending && locating && <p className="nearby-bar-locating" role="status"><Loader2 size={15} className="location-spin" aria-hidden="true" />Finding your location…</p>}
          {problem && <p className="nearby-bar-problem" role="status">{problem}</p>}
          <LocationSearch
            inputRef={searchInputRef}
            onSelect={(place) => { setChanging(false); onSelectPlace(place); }}
            onUseDevice={() => { setChanging(false); onUseDevice(); }}
            allowDevice={!problem || !problem.startsWith("Location access is unavailable")}
            deviceBusy={locating}
            near={near && !near.pending ? near : undefined}
            autoFocus={changing}
          />
        </div>
      )}
    </section>
  );
};

export default NearbyBar;
