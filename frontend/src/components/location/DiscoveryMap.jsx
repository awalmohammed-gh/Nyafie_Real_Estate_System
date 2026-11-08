import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Bed, LocateFixed, MapPin, Search, X } from "lucide-react";
import L, { addTiles } from "../../utils/leaflet";
import { compactPrice, formatDistance, zoomForRadius } from "../../utils/geo";
import { formatType } from "../../utils/property";
import { propertyCardImageSources } from "../../utils/propertyImages";
import "./location.css";

const priceLine = (marker) => {
  const prefix = marker.currency === "GHS" || !marker.currency ? "₵" : `${marker.currency} `;
  const period = marker.listingType === "Rent" ? (marker.pricePeriod === "night" ? " /night" : marker.pricePeriod === "month" ? " /month" : "") : "";
  return `${prefix}${Number(marker.price || 0).toLocaleString()}${period}`;
};

const propertyIcon = (marker, selected) => L.divIcon({
  className: "",
  html: `<span class="map-price-pin ${marker.listingType === "Rent" ? "is-rent" : "is-sale"}${selected ? " is-selected" : ""}">${compactPrice(marker.price, { currency: marker.currency, period: marker.listingType === "Rent" ? marker.pricePeriod : "total" })}</span>`,
  iconSize: null,
  iconAnchor: [0, 0],
});

const centerIcon = (source) => L.divIcon({
  className: "",
  html: source === "device" ? '<span class="map-visitor-dot" aria-hidden="true"></span>' : '<span class="map-search-pin" aria-hidden="true"></span>',
  iconSize: [22, 22],
  iconAnchor: source === "device" ? [11, 11] : [11, 22],
});

/**
 * The nearby-search map. markers come from the same server search as the list (format=markers).
 * center is the search location: an approximate device position (a blue dot, never a precise pin)
 * or a searched place. Moving the map offers "Search this area" rather than refetching on every
 * pan, so no request is made until the visitor asks.
 */
const DiscoveryMap = ({ center, radius, markers = [], loading = false, error = "", onRetry, onSearchArea, className = "" }) => {
  const element = useRef(null);
  const map = useRef(null);
  const layers = useRef({});
  const programmatic = useRef(false);
  const [selectedId, setSelectedId] = useState(null);
  // The visitor moved the map away from this search area (keyed, so a new search hides it by itself)
  const areaKey = center ? `${center.latitude},${center.longitude},${radius}` : "";
  const [movedState, setMoved] = useState(null);
  const moved = movedState?.areaKey === areaKey ? movedState : null;
  const areaKeyRef = useRef(areaKey);
  useEffect(() => { areaKeyRef.current = areaKey; }, [areaKey]);
  const selected = markers.find((marker) => marker.id === selectedId) || null;

  // Create the map once
  useEffect(() => {
    const instance = L.map(element.current, { zoomControl: true, scrollWheelZoom: true, attributionControl: true });
    addTiles(instance);
    layers.current.cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true }).addTo(instance);
    const track = () => {
      if (programmatic.current) return;
      const { lat, lng } = instance.getCenter();
      setMoved({ areaKey: areaKeyRef.current, latitude: lat, longitude: lng });
    };
    instance.on("dragend zoomend", track);
    instance.on("click", () => setSelectedId(null));
    map.current = instance;
    // The container can change size (view switch, mobile toolbar): keep tiles filling it
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; layers.current = {}; };
  }, []);

  // Search location and radius: centre marker, radius circle and a view that fits it
  useEffect(() => {
    const instance = map.current;
    if (!instance || !center) return;
    layers.current.center?.remove();
    layers.current.circle?.remove();
    const point = [center.latitude, center.longitude];
    layers.current.circle = L.circle(point, { radius: radius * 1000, className: "map-radius-circle", interactive: false }).addTo(instance);
    layers.current.center = L.marker(point, {
      icon: centerIcon(center.source),
      keyboard: false,
      interactive: false,
      title: center.source === "device" ? "Your approximate location" : `Search centre: ${center.label}`,
      zIndexOffset: -100,
    }).addTo(instance);
    programmatic.current = true;
    // Bounds from the centre and radius: a layer's own getBounds() needs a map that already has a
    // view, which a map opened straight from a link doesn't have yet
    layers.current.bounds = L.latLng(point).toBounds(radius * 2000);
    instance.fitBounds(layers.current.bounds, { padding: [24, 24], maxZoom: zoomForRadius(radius) + 1, animate: false });
    // fitBounds fires zoomend synchronously or on the next frame; either way it isn't the visitor moving
    requestAnimationFrame(() => { programmatic.current = false; });
  }, [center?.latitude, center?.longitude, center?.source, center?.label, radius]); // eslint-disable-line react-hooks/exhaustive-deps

  // Property markers: one per result, clustered when they crowd together
  useEffect(() => {
    const cluster = layers.current.cluster;
    if (!cluster) return;
    cluster.clearLayers();
    const pins = markers
      .filter((marker) => Number.isFinite(marker.location?.latitude) && Number.isFinite(marker.location?.longitude))
      .map((marker) => L.marker([marker.location.latitude, marker.location.longitude], {
        icon: propertyIcon(marker, marker.id === selectedId),
        title: `${marker.title}, ${priceLine(marker)}`,
        alt: marker.title,
        riseOnHover: true,
        zIndexOffset: marker.id === selectedId ? 1000 : 0,
      }).on("click", (event) => { L.DomEvent.stopPropagation(event); setSelectedId(marker.id); }));
    cluster.addLayers(pins);
  }, [markers, selectedId]);

  const recenter = () => {
    if (!map.current || !layers.current.bounds) return;
    programmatic.current = true;
    map.current.fitBounds(layers.current.bounds, { padding: [24, 24], animate: true });
    map.current.once("moveend", () => { programmatic.current = false; });
    setMoved(null);
  };

  const image = selected?.image ? propertyCardImageSources(selected.image) : null;

  return (
    <div className={`discovery-map ${className}`}>
      <div ref={element} className="discovery-map-canvas" role="region" aria-label={`Map of properties ${center ? `within ${radius} km of ${center.label}` : ""}`} />
      <div className="discovery-map-legend" aria-hidden="true">
        <span><i className="map-legend-dot is-sale" />For sale</span>
        <span><i className="map-legend-dot is-rent" />For rent</span>
        {center?.source === "device" && <span><i className="map-legend-dot is-visitor" />You (approximate)</span>}
      </div>
      {moved && onSearchArea && (
        <div className="discovery-map-actions">
          <button type="button" className="discovery-map-search-area" onClick={() => { onSearchArea({ latitude: moved.latitude, longitude: moved.longitude }); setMoved(null); }}><Search size={15} aria-hidden="true" />Search this area</button>
          <button type="button" className="discovery-map-recenter" onClick={recenter} aria-label="Back to the search area"><LocateFixed size={16} aria-hidden="true" /></button>
        </div>
      )}
      {(loading || error) && (
        <div className={`discovery-map-status ${error ? "is-error" : ""}`} role="status">
          {error ? <>{error}{onRetry && <button type="button" onClick={onRetry}>Try again</button>}</> : "Loading properties on the map…"}
        </div>
      )}
      {!loading && !error && markers.length === 0 && (
        <div className="discovery-map-status" role="status">No properties found around this location.</div>
      )}
      {selected && (
        <article className="discovery-map-preview" aria-label={`Selected property: ${selected.title}`}>
          <button type="button" className="discovery-map-preview-close" aria-label="Close preview" onClick={() => setSelectedId(null)}><X size={15} aria-hidden="true" /></button>
          <div className="discovery-map-preview-image">
            {image ? <img src={image.src} srcSet={image.srcSet} sizes="140px" alt="" loading="lazy" /> : <MapPin size={22} aria-hidden="true" />}
            <span className={`map-preview-badge ${selected.listingType === "Rent" ? "is-rent" : "is-sale"}`}>{selected.listingType === "Rent" ? "For rent" : "For sale"}</span>
          </div>
          <div className="discovery-map-preview-body">
            <p className="map-preview-price">{priceLine(selected)}</p>
            <h3>{selected.title}</h3>
            <p className="map-preview-meta"><MapPin size={13} aria-hidden="true" />{[selected.location?.neighbourhood, selected.location?.city].filter(Boolean).join(", ")}</p>
            <p className="map-preview-meta">
              <span>{formatDistance(selected.distance, { approximate: selected.location?.pinSource === "address" })}</span>
              {selected.bedrooms > 0 && <span><Bed size={13} aria-hidden="true" />{selected.bedrooms} {selected.bedrooms === 1 ? "bed" : "beds"}</span>}
              <span>{formatType(selected.propertyType || "")}</span>
            </p>
            <Link to={`/house/${selected.id}`} className="map-preview-link">View details<ArrowUpRight size={15} aria-hidden="true" /></Link>
          </div>
        </article>
      )}
    </div>
  );
};

export default DiscoveryMap;
