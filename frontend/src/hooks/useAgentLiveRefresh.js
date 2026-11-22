import { useRealEstate } from "../context/useRealEstate";
import { useBackgroundRefresh } from "./useBackgroundRefresh";

/**
 * Keeps the agent workspace's listings (with their live view counts) current: reloaded in the
 * background every minute while the tab is visible, and as soon as the agent comes back to the tab.
 */
export const useAgentLiveRefresh = () => {
  const { refreshListings } = useRealEstate();
  useBackgroundRefresh(refreshListings);
};
