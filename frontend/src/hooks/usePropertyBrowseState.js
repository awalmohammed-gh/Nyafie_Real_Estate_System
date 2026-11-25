import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { isShortStaySearch } from "../utils/shortStay";
import { priceLabel, tabOf } from "../utils/browseTabs";

// Listing features people filter by most; matched against each listing's amenities on the server
export const FEATURE_OPTIONS = ["Parking", "Furnished", "Swimming Pool", "24/7 Security", "Air Conditioning", "Borehole", "Solar Backup", "Garden"];

// Filters. The search location (near, place, radius) and view (list/map) are kept by "Clear all".
const URL_KEYS = ["status", "purpose", "stay", "type", "region", "city", "area", "minPrice", "maxPrice", "bedrooms", "bathrooms", "availability", "amenities", "search", "sort", "page"];
const SORTS = ["latest", "priceAsc", "priceDesc", "popular", "rating"];
const numberParam = (params, key) => {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
};
// The URL is the source of truth: refresh, shared links and Back restore the same search.
// place: a location page's fixed neighbourhood/city ({ area?, city }), which the URL cannot change
export const usePropertyBrowseState = (fixedListingType, place = null) => {
  const [params, setParams] = useSearchParams();
  const min = numberParam(params, "minPrice");
  const max = numberParam(params, "maxPrice");
  const listingType = fixedListingType || (["Sale", "Rent"].includes(params.get("status")) ? params.get("status") : ({ rent: "Rent", sale: "Sale" })[params.get("purpose")] || "");
  const stay = !fixedListingType && isShortStaySearch(params);
  const tab = tabOf({ listingType, stay });
  const price = min === null && max === null ? null : { min, max, label: priceLabel(tab, min, max) };
  const filters = {
    tab, // "" | Sale | Rent | stay
    listingType: stay ? "" : listingType,
    stay,
    types: [...new Set((params.get("type") || "").split(",").map((value) => value.trim()).filter(Boolean))],
    area: place ? place.area || "" : params.get("area") || "",
    city: place ? place.city || "" : params.get("city") || "",
    region: params.get("region") || "",
    price,
    beds: Math.floor(numberParam(params, "bedrooms") || 0),
    baths: Math.floor(numberParam(params, "bathrooms") || 0),
    availability: ["Available", "Under Offer"].includes(params.get("availability")) ? params.get("availability") : "",
    amenities: [...new Set((params.get("amenities") || "").split(",").map((value) => value.trim()).filter((value) => FEATURE_OPTIONS.includes(value)))],
  };
  const view = params.get("view") === "map" ? "map" : "list";
  const query = params.get("search") || "";
  const sort = SORTS.includes(params.get("sort")) ? params.get("sort") : "";
  const page = Math.max(1, Math.floor(numberParam(params, "page") || 1));
  const [search, setSearch] = useState(query.trim());

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const update = (changes, { replace = false } = {}) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      const write = (key, value) => value === null || value === undefined || value === "" || value === 0
        ? next.delete(key) : next.set(key, String(value));
      if (!("page" in changes)) next.delete("page");
      for (const [key, value] of Object.entries(changes)) {
        if (key === "listingType") next.delete("purpose");
        if (key === "types") write("type", value.join(","));
        else if (key === "amenities") write("amenities", value.join(","));
        else if (key === "price") {
          // A zero lower bound is equivalent to no lower restriction.
          write("minPrice", value?.min);
          write("maxPrice", value?.max);
        } else write(({ listingType: "status", beds: "bedrooms", baths: "bathrooms", query: "search" })[key] || key, value);
      }
      return next;
    }, { replace, preventScrollReset: true });
  };

  const clear = () => setParams((current) => {
    const next = new URLSearchParams(current);
    URL_KEYS.forEach((key) => next.delete(key));
    return next;
  }, { preventScrollReset: true });

  // params: the raw URL values, for the search location (utils/geo.js parseNear)
  return { filters, query, search, sort, page, view, params, update, clear };
};
