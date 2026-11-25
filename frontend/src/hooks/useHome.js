import { propertyApi } from "../frontApi";
import { useAuth } from "../context/useAuth";
import { useApiQuery } from "./useApiQuery";

// Everything the home page lists, in one request (signed-in visitors also get the agents' names)
export const useHome = () => {
  const { user } = useAuth();
  return useApiQuery(`home:${user?.id || "guest"}`, (signal) => propertyApi.getHome({ signal }));
};
