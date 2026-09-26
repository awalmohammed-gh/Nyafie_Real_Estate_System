import { useMemo } from "react";
import { useAuth } from "../context/useAuth";
import { useRealEstate } from "../context/useRealEstate";
import { useAgentPermissions } from "./useAgentPermissions";

// The signed-in agent's own data plus their permissions.
// Agents only ever see listings they own and inquiries about those listings.
export const useAgent = () => {
  const auth = useAuth();
  const { listings, inquiries } = useRealEstate();
  const permissions = useAgentPermissions();
  const userId = auth.user?.id;

  return useMemo(() => {
    const myProperties = listings.filter((p) => p.owner.type === "agent" && p.owner.id === userId);
    const myInquiries = inquiries.filter((inq) => inq.ownerType === "agent" && inq.ownerId === userId);
    return { ...auth, myProperties, myInquiries, permissions };
  }, [auth, listings, inquiries, userId, permissions]);
};
