import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Search, Trash2 } from "lucide-react";
import L, { addTiles, GHANA_VIEW, propertyPinIcon } from "../../utils/leaflet";
import { geoApi } from "../../frontApi";
import { isCoordinate } from "../../utils/geo";
import "./location.css";

const round = (value) => Math.round(value * 1e6) / 1e6; // about 10 cm: plenty for a front door

/**
 * Map pin for the listing editor (agents and admins). value: { latitude, longitude } or nulls.
 * "Find on map" geocodes the address typed in the form; the agent then drags or clicks to the
 * exact building. Nothing is saved until the form is. Without a pin the listing still publishes,
 * it just doesn't appear in nearby search.
 */
const LocationPicker = ({ latitude, longitude, onChange, addressQuery, approximate = false }) => {
  const element = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const [finding, setFinding] = useState(false);
  const [message, setMessage] = useState({ text: "", tone: "" });
  const [matches, setMatches] = useState([]);
  const hasPin = isCoordinate(latitude, longitude);
  const change = useRef(onChange);
  useEffect(() => { change.current = onChange; });

  useEffect(() => {
    const instance = L.map(element.current, { zoomControl: true, scrollWheelZoom: false });
    addTiles(instance);
    instance.setView(GHANA_VIEW.center, GHANA_VIEW.zoom);
    instance.on("click", (event) => {
      setMatches([]);
      setMessage({ text: "", tone: "" }); // the note now shows the new coordinates
      change.current({ latitude: round(event.latlng.lat), longitude: round(event.latlng.lng) });
    });
    // Scroll-zoom only after the agent interacts, so scrolling the long form never gets trapped
    instance.on("focus mousedown touchstart", () => instance.scrollWheelZoom.enable());
    map.current = instance;
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; marker.current = null; };
  }, []);

  // Keep the pin in step with the form (typed coordinates, Find on map, drag, remove)
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!hasPin) { marker.current?.remove(); marker.current = null; return; }
    const point = [latitude, longitude];
    if (!marker.current) {
      marker.current = L.marker(point, { icon: propertyPinIcon, draggable: true, autoPan: true, title: "Property location (drag to adjust)", alt: "Property location" }).addTo(instance);
      marker.current.on("dragend", () => {
        const { lat, lng } = marker.current.getLatLng();
        setMessage({ text: "", tone: "" });
        change.current({ latitude: round(lat), longitude: round(lng) });
      });
      instance.setView(point, Math.max(instance.getZoom(), 16));
    } else {
      marker.current.setLatLng(point);
      if (!instance.getBounds().pad(-0.1).contains(point)) instance.panTo(point);
    }
  }, [hasPin, latitude, longitude]);

  const place = (match) => {
    setMatches([]);
    onChange({ latitude: round(match.latitude), longitude: round(match.longitude) });
    map.current?.setView([match.latitude, match.longitude], match.type === "house" || match.type === "street" ? 17 : 15);
    setMessage({ text: `Placed near ${match.label}. Drag the pin onto the exact building.`, tone: "" });
  };

  const findOnMap = async () => {
    const query = addressQuery.trim();
    if (query.length < 2) { setMessage({ text: "Enter the street address, neighbourhood or city first.", tone: "error" }); return; }
    setFinding(true);
    setMessage({ text: "", tone: "" });
    try {
      const found = await geoApi.searchPlaces(query, { purpose: "address" });
      if (!found.length) setMessage({ text: "We couldn't find that address. Click the map where the property is instead.", tone: "error" });
      else if (found.length === 1) place(found[0]);
      else { setMatches(found.slice(0, 5)); setMessage({ text: "Several places match. Choose the right one:", tone: "" }); }
    } catch (error) {
      setMessage({ text: error.message || "Location search is unavailable right now.", tone: "error" });
    } finally {
      setFinding(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setMessage({ text: "This browser can't share its location.", tone: "error" }); return; }
    setFinding(true);
    // High accuracy here: the agent is standing at the property and wants the exact spot
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setFinding(false); place({ latitude: coords.latitude, longitude: coords.longitude, label: "your current position", type: "house" }); },
      (error) => { setFinding(false); setMessage({ text: error.code === 1 ? "Location access is blocked for this site. Find the address or click the map instead." : "Your location couldn't be found. Find the address or click the map instead.", tone: "error" }); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  return (
    <div className="location-picker">
      <div className="location-picker-toolbar">
        <button type="button" onClick={findOnMap} disabled={finding} className="location-picker-button is-primary">
          {finding ? <Loader2 size={15} className="location-spin" aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}Find address on map
        </button>
        <button type="button" onClick={useMyLocation} disabled={finding} className="location-picker-button"><Crosshair size={15} aria-hidden="true" />I'm at the property</button>
        {hasPin && <button type="button" onClick={() => { onChange(null); setMessage({ text: "Pin removed. The listing won't appear in nearby search until you add one.", tone: "" }); }} className="location-picker-button is-quiet"><Trash2 size={15} aria-hidden="true" />Remove pin</button>}
      </div>
      {matches.length > 0 && (
        <ul className="location-picker-matches" aria-label="Matching places">
          {matches.map((match) => <li key={match.id}><button type="button" onClick={() => place(match)}><MapPin size={14} aria-hidden="true" /><span>{match.name}<small>{match.description}</small></span></button></li>)}
        </ul>
      )}
      <div ref={element} className="location-picker-map" role="application" aria-label="Map: click to place the property pin, drag the pin to adjust" />
      <p className={`location-picker-note ${message.tone === "error" ? "is-error" : ""}`} role="status">
        {message.text || (hasPin
          ? approximate
            ? "Placed automatically at the neighbourhood from the address. Drag the pin onto the exact building so distances are precise."
            : `Pinned at ${latitude.toFixed(5)}, ${longitude.toFixed(5)}. Drag the pin to adjust.`
          : "No pin yet. Find the address or click the map. Otherwise the listing is placed at its neighbourhood automatically when you save.")}
      </p>
    </div>
  );
};

export default LocationPicker;
