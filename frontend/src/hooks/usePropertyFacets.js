import { propertyApi } from "../frontApi";
import { useApiQuery } from "./useApiQuery";

// Several homepage sections read the same facets; share one request for a minute
const cache = new Map();
const loadFacets = (listingType) => {
  let entry = cache.get(listingType);
  if (!entry || Date.now() - entry.at > 60000) {
    const promise = propertyApi
      .getPropertyFacets({ listingType })
      .catch((err) => {
        if (cache.get(listingType)?.promise === promise)
          cache.delete(listingType);
        throw err;
      });
    entry = { promise, at: Date.now() };
    cache.set(listingType, entry);
  }
  return entry.promise;
};

// Headline numbers and filter options for public listings, computed in MongoDB
export const usePropertyFacets = (listingType = "") =>
  useApiQuery(`home-facets:${listingType}`, () => loadFacets(listingType));
