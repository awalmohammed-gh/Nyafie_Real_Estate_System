import { useCallback, useRef, useState } from "react";
import { propertyApi } from "../frontApi";

export const CATEGORY_PREVIEW_LIMIT = 3;

// What each homepage menu shows: homes for sale, homes to rent, and short stays (their own menu)
const QUERIES = {
  buy: { listingType: "Sale" },
  rent: { listingType: "Rent", stay: "false" },
  stays: { stay: "true" },
};

/**
 * Three live listings for each homepage navbar menu (Buy, Rent, Short Stays), loaded the first
 * time that menu opens and reused afterwards. `ensure(menu)` starts loading; `get(menu)` returns
 * { status: "idle" | "loading" | "ready" | "error", items }.
 */
export const useCategoryPreviews = () => {
  const [state, setState] = useState({});
  const requested = useRef(new Set());

  const load = useCallback((menu) => {
    if (!QUERIES[menu]) return;
    requested.current.add(menu);
    setState((current) => ({ ...current, [menu]: { status: "loading", items: [] } }));
    propertyApi
      .searchProperties({ ...QUERIES[menu], limit: CATEGORY_PREVIEW_LIMIT, sort: "featured", availability: ["Available", "Under Offer"] })
      .then(({ items }) => {
        setState((current) => ({ ...current, [menu]: { status: "ready", items } }));
      })
      .catch(() => setState((current) => ({ ...current, [menu]: { status: "error", items: [] } })));
  }, []);

  const ensure = useCallback((menu) => {
    if (!requested.current.has(menu)) load(menu);
  }, [load]);

  const get = useCallback((menu) => ({ ...(state[menu] || { status: "idle", items: [] }), reload: () => load(menu) }), [state, load]);

  return { ensure, get };
};
