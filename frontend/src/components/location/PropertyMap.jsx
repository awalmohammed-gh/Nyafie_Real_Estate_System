import { useEffect, useRef } from "react";
import L, { addTiles } from "../../utils/leaflet";
import "./location.css";

const pinIcon = L.divIcon({ className: "", html: '<span class="map-search-pin is-property" aria-hidden="true"></span>', iconSize: [26, 26], iconAnchor: [13, 26] });
const AREA_RADIUS = 700; // metres: roughly a neighbourhood centre

/**
 * Where the house is, on its details page. An exact pin gets a marker; a pin found from the
 * address (approximate) gets a soft circle labelled as the area, so it never looks more precise
 * than it is. Scroll-zoom waits for a click, so scrolling the page never gets caught by the map.
 */
const PropertyMap = ({ latitude, longitude, title, approximate = false }) => {
  const element = useRef(null);

  useEffect(() => {
    const point = [latitude, longitude];
    const map = L.map(element.current, { scrollWheelZoom: false, zoomControl: true });
    addTiles(map);
    if (approximate) {
      L.circle(point, { radius: AREA_RADIUS, className: "property-map-area", interactive: false }).addTo(map);
      // Bounds from the point (the circle's own bounds need a map that already has a view)
      map.fitBounds(L.latLng(point).toBounds(AREA_RADIUS * 3), { animate: false });
    } else {
      L.marker(point, { icon: pinIcon, title, alt: title, keyboard: false }).addTo(map);
      map.setView(point, 16);
    }
    map.on("click focus", () => map.scrollWheelZoom.enable());
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(element.current);
    return () => { observer.disconnect(); map.remove(); };
  }, [latitude, longitude, title, approximate]);

  return (
    <figure className="property-map">
      <div ref={element} className="property-map-canvas" role="img" aria-label={approximate ? `Map of the area around ${title}` : `Map showing where ${title} is`} />
      {approximate && <figcaption className="property-map-note">The shaded circle shows the neighbourhood, not the exact house. Use the address above for the precise location.</figcaption>}
    </figure>
  );
};

export default PropertyMap;
