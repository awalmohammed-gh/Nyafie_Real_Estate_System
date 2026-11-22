import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";

/**
 * Leaflet with marker clustering, loaded only by the map components (which are lazy-loaded),
 * so pages without a map never download it. The clustering plugin registers itself on the
 * global L, so it is imported after L is exposed.
 */
globalThis.L = L;
await import("leaflet.markercluster");

// OpenStreetMap's standard tiles. VITE_MAP_TILE_URL can point to a commercial or self-hosted
// tile service with the same {z}/{x}/{y} scheme when traffic outgrows OpenStreetMap's fair use.
export const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = import.meta.env.VITE_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

export const addTiles = (map) => L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION, crossOrigin: true }).addTo(map);

// Ghana, for maps with nothing to centre on yet
export const GHANA_VIEW = { center: [7.95, -1.03], zoom: 6 };

// The property's own pin (listing editor and details page)
export const propertyPinIcon = L.divIcon({ className: "", html: '<span class="map-search-pin is-property" aria-hidden="true"></span>', iconSize: [26, 26], iconAnchor: [13, 26] });

export default L;
