import { approximatePosition, isCoordinate } from "./geo.js";

/**
 * The visitor's location choice, shared by the homepage and the listings page.
 *  - choice  ("device" | "manual" | "skip" | "denied") is remembered on this device, so the
 *            permission explainer isn't shown on every visit.
 *  - place   (the last place searched for) is remembered too: it is a public place, not the visitor.
 *  - position (from the browser) is rounded to ~110 m immediately and kept only in this tab's
 *            sessionStorage for 30 minutes. It is never put in a URL, stored on the server or shared.
 * Storage can be unavailable (private mode, blocked site data); everything still works in memory.
 */
const CHOICE_KEY = "nyafie.location.choice";
const PLACE_KEY = "nyafie.location.place";
const POSITION_KEY = "nyafie.location.position";
const POSITION_TTL = 30 * 60 * 1000;
const CHOICES = ["device", "manual", "skip", "denied"];

const read = (storage, key) => {
  try { return JSON.parse(globalThis[storage]?.getItem(key) ?? "null"); } catch { return null; }
};
const write = (storage, key, value) => {
  try {
    if (value === null || value === undefined) globalThis[storage]?.removeItem(key);
    else globalThis[storage]?.setItem(key, JSON.stringify(value));
  } catch { /* storage blocked: keep the value in memory only */ }
};

const initialPosition = () => {
  const saved = read("sessionStorage", POSITION_KEY);
  return saved && isCoordinate(saved.latitude, saved.longitude) && Date.now() - saved.at < POSITION_TTL ? approximatePosition(saved) : null;
};
const initialPlace = () => {
  const saved = read("localStorage", PLACE_KEY);
  return saved && isCoordinate(saved.latitude, saved.longitude) && typeof saved.label === "string" ? { label: saved.label.slice(0, 120), latitude: saved.latitude, longitude: saved.longitude } : null;
};

let state = {
  // idle | locating | ready | denied | unavailable | timeout | unsupported
  status: initialPosition() ? "ready" : "idle",
  position: initialPosition(),
  choice: CHOICES.includes(read("localStorage", CHOICE_KEY)) ? read("localStorage", CHOICE_KEY) : null,
  place: initialPlace(),
};
const listeners = new Set();
const setState = (changes) => {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getSnapshot = () => state;

export const setChoice = (choice) => {
  write("localStorage", CHOICE_KEY, CHOICES.includes(choice) ? choice : null);
  setState({ choice: CHOICES.includes(choice) ? choice : null });
};

export const rememberPlace = (place) => {
  const saved = place && isCoordinate(place.latitude, place.longitude) ? { label: String(place.label || "").slice(0, 120), latitude: place.latitude, longitude: place.longitude } : null;
  write("localStorage", PLACE_KEY, saved);
  setState({ place: saved });
};

export const forgetPosition = () => {
  write("sessionStorage", POSITION_KEY, null);
  setState({ position: null, status: "idle" });
};

const geolocation = () => (globalThis.isSecureContext !== false && globalThis.navigator?.geolocation) || null;

// "granted" | "denied" | "prompt" | "unsupported" (never shows a prompt)
export const permissionState = async () => {
  if (!geolocation()) return "unsupported";
  try { return (await globalThis.navigator.permissions?.query({ name: "geolocation" }))?.state || "prompt"; } catch { return "prompt"; }
};

let pending = null;
/**
 * Asks the browser for the visitor's position (shows the browser prompt the first time).
 * Resolves to the approximate position, or null with state.status saying why not.
 * A permission the visitor already denied is respected: the browser is not asked again.
 */
export const requestDevicePosition = () => {
  if (pending) return pending;
  if (!geolocation()) { setState({ status: "unsupported" }); return Promise.resolve(null); }
  setState({ status: "locating" });
  pending = (async () => {
    if (await permissionState() === "denied") {
      setChoice("denied");
      setState({ status: "denied" });
      return null;
    }
    return new Promise((resolve) => {
      geolocation().getCurrentPosition(
        ({ coords }) => {
          const position = approximatePosition(coords);
          write("sessionStorage", POSITION_KEY, { ...position, at: Date.now() });
          setChoice("device");
          setState({ status: "ready", position });
          resolve(position);
        },
        (error) => {
          const status = error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable";
          if (status === "denied") setChoice("denied");
          setState({ status });
          resolve(null);
        },
        // City-block accuracy is plenty for a 1 km search, and is faster and kinder to batteries
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 },
      );
    });
  })().finally(() => { pending = null; });
  return pending;
};

/**
 * The "Use your location?" card (components/location/LocationPrompt.jsx). It explains why first,
 * so the browser's own prompt only ever appears after the visitor presses "Allow location".
 *  - "ask"    never answered, and the browser hasn't decided yet: show the card
 *  - "locate" never answered here, but this browser already allows the site: use it quietly
 *  - "none"   they chose already (shared, picked a place, "Not now", refused), or it can't work here
 * A search already finding their position (e.g. ?near=me) is left to do its own asking.
 */
export const LOCATION_PROMPT_DELAY_MS = 4000; // a moment to see the page before being asked anything
export const locationPromptAction = ({ choice, status }, permission) => {
  if (choice !== null || status !== "idle") return "none";
  if (permission === "prompt") return "ask";
  if (permission === "granted") return "locate";
  return "none";
};
// Not while someone is signing in, paying or making an offer
export const locationPromptAllowedOn = (pathname) => !/^\/(account|checkout|payment|make-offer|login|register|agent\/join)(\/|$)/.test(pathname);

// What to tell the visitor when the position couldn't be read
export const LOCATION_PROBLEMS = {
  denied: "Location access is unavailable. Search for a location manually to discover nearby properties.",
  unavailable: "We couldn't find your location right now. Search for a location manually instead.",
  timeout: "Finding your location took too long. Try again, or search for a location manually.",
  unsupported: "This browser can't share your location here. Search for a location manually instead.",
};
