import { useCallback, useRef, useState } from "react";
import { propertyApi } from "../frontApi";

export const PREVIEW_LIMIT = 2;

/**
 * Loads two live listings for Find Property only.
 * One bounded request on first desktop open; subsequent opens reuse it.
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
