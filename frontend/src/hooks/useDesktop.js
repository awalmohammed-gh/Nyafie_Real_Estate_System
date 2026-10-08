import { useSyncExternalStore } from "react";
const query = "(min-width: 1024px)";
const subscribe = (callback) => { const media = window.matchMedia(query); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); };
const snapshot = () => window.matchMedia(query).matches;
// Keep desktop detail panes and mobile dialogs mutually exclusive as the viewport changes.
export const useDesktop = () => useSyncExternalStore(subscribe, snapshot, () => true);
