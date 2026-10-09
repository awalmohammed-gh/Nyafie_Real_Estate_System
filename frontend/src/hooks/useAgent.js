import { useMemo } from "react";
import { useAuth } from "../context/useAuth";
import { useRealEstate } from "../context/useRealEstate";
import { useAgentPermissions } from "./useAgentPermissions";

// The signed-in agent's own data plus their permissions.
// Agents only ever see listings they own and inquiries about those listings. Agency staff get the
// agency's records, already narrowed by the server to what their role covers.
export const useAgent = () => {
  const auth = useAuth();
  const { listings, inquiries } = useRealEstate();
  const permissions = useAgentPermissions();
  const userId = auth.user?.agency?.ownerId || auth.user?.id;

  return useMemo(() => {
    const myProperties = listings.filter((p) => p.owner.type === "agent" && p.owner.id === userId);
    const myInquiries = inquiries.filter((inq) => inq.ownerType === "agent" && inq.ownerId === userId);
    return { ...auth, myProperties, myInquiries, permissions };
  }, [auth, listings, inquiries, userId, permissions]);
};
