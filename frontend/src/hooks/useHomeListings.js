import { propertyApi } from "../frontApi";
import { useApiQuery } from "./useApiQuery";

// Fetch only four public properties; the API enforces visibility and eligibility.
export const useHomeListings = (category = "", center = null) => {
  const params = {
    sort: center ? undefined : "featured", availability: "Available", limit: 4,
    listingType: ["Sale", "Rent"].includes(category) ? category : undefined,
    type: category === "stay" ? ["Hotel", "Hotel-Apartment"] : undefined,
  };
  return useApiQuery(JSON.stringify({ home: params, center }), (signal) => center
    ? propertyApi.nearbyProperties({ ...params, ...center }, { signal })
    : propertyApi.searchProperties(params, { signal }));
};
