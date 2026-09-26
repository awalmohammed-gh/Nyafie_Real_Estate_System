import { useMemo } from "react";
import { useAuth } from "../context/useAuth";
import { usePlatform } from "../context/usePlatform";
import { useRealEstate } from "../context/useRealEstate";
import { getAgentPermissions } from "../utils/permissions";

// Reusable access to the centralized agent permission system
export const useAgentPermissions = () => {
  const { user } = useAuth();
  const { plans, settings } = usePlatform();
  const { listings } = useRealEstate();
  return useMemo(() => getAgentPermissions({ user, plans, settings, listings }), [user, plans, settings, listings]);
};
