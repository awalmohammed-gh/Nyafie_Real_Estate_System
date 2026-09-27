import { useCallback, useRef, useState } from "react";
import { propertyApi } from "../frontApi";

export const PREVIEW_LIMIT = 4;

/**
 * Loads a few live listings (MongoDB -> GET /api/properties) for the navbar's Properties menu.
 * Nothing is fetched until the menu is first opened; call ensureLoaded() when it opens.
 */
export const useNavPropertyPreviews = () => {
  const [state, setState] = useState({ status: "idle", items: [] });
  const requested = useRef(false);

  const load = useCallback(() => {
    requested.current = true;
    setState({ status: "loading", items: [] });
    propertyApi
      .searchProperties({ limit: PREVIEW_LIMIT, sort: "featured", availability: ["Available", "Under Offer"] })
      .then(({ items }) => setState({ status: "ready", items }))
      .catch(() => setState({ status: "error", items: [] }));
  }, []);

  const ensureLoaded = useCallback(() => {
    if (!requested.current) load();
  }, [load]);

  return { ...state, ensureLoaded, reload: load };
};
