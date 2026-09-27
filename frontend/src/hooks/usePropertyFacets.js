import { propertyApi } from "../frontApi";
import { useApiQuery } from "./useApiQuery";

// Several homepage sections read the same facets; share one request for a minute
let cache = null;
const loadFacets = () => {
  if (!cache || Date.now() - cache.at > 60000) {
    const promise = propertyApi.getPropertyFacets().catch((err) => {
      cache = null; // let the next caller retry
      throw err;
    });
    cache = { promise, at: Date.now() };
  }
  return cache.promise;
};

// Headline numbers and filter options for public listings, computed in MongoDB
export const usePropertyFacets = () => useApiQuery("home-facets", loadFacets);
