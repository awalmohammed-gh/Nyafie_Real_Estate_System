import { propertyApi } from "../frontApi";
import { useApiQuery } from "./useApiQuery";
import { ROW_SIZE } from "../utils/homeRows";

// The home page's "near you" row: loaded only while it is switched on
export const useNearbyHomes = (center) => {
  const params = { availability: "Available", limit: ROW_SIZE };
  return useApiQuery(center ? JSON.stringify({ nearbyHome: params, center }) : null, (signal) => propertyApi.nearbyProperties({ ...params, ...center }, { signal }));
};
