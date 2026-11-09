import { useCallback, useRef, useState } from "react";
import { propertyApi } from "../frontApi";

export const CATEGORY_PREVIEW_LIMIT = 3;
const HOTEL_TYPES = ["Hotel", "Hotel-Apartment"];
const isHotelType = (property) => HOTEL_TYPES.some((type) => type.toLowerCase() === String(property.property?.type || "").toLowerCase());

// What each homepage menu shows: homes for sale, homes to rent (hotels have their own menu), short stays
const QUERIES = {
  buy: { listingType: "Sale" },
  rent: { listingType: "Rent" },
  stays: { type: HOTEL_TYPES },
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
      .searchProperties({ ...QUERIES[menu], limit: 9, sort: "featured", availability: ["Available", "Under Offer"] })
      .then(({ items }) => {
        const shown = (menu === "rent" ? items.filter((property) => !isHotelType(property)) : items).slice(0, CATEGORY_PREVIEW_LIMIT);
        setState((current) => ({ ...current, [menu]: { status: "ready", items: shown } }));
      })
      .catch(() => setState((current) => ({ ...current, [menu]: { status: "error", items: [] } })));
  }, []);

  const ensure = useCallback((menu) => {
    if (!requested.current.has(menu)) load(menu);
  }, [load]);

  const get = useCallback((menu) => ({ ...(state[menu] || { status: "idle", items: [] }), reload: () => load(menu) }), [state, load]);

  return { ensure, get };
};
