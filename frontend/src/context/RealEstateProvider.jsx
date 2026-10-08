import { useCallback, useEffect, useMemo, useState } from "react";
import { mergeAgents } from "../utils/property";
import { readStorage, writeStorage } from "../utils/storage";
import { RealEstateContext } from "./realEstateContext";
import { useAuth } from "./useAuth";
import { propertyApi, agentApi, adminApi, inquiryApi, userApi } from "../frontApi";
import { canAccessAgent } from "../utils/sessionDomain";

const GUEST_FAVORITES_KEY = "homebase:favorites";

// Listings, inquiries and favorites backed by the API.
//  - properties: what the public can see
//  - listings:   the agent's own listings, or every listing for admins
//  - inquiries:  sent (customers), received (agents) or all (admins)
export const RealEstateProvider = ({ children }) => {
  const { user, users, refreshUser } = useAuth();
  const role = user?.role === "agent" && !canAccessAgent(user) ? undefined : user?.role;
  const userId = user?.id;

  const [properties, setProperties] = useState([]);
  const [agentDirectory, setAgentDirectory] = useState(undefined); // undefined = loading, null = unavailable
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [listings, setListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsLoadedFor, setListingsLoadedFor] = useState(null); // role whose listings are loaded
  const [inquiries, setInquiries] = useState([]);
  const [guestFavorites, setGuestFavorites] = useState(() => readStorage(GUEST_FAVORITES_KEY, []));
  const [savedIds, setSavedIds] = useState([]);

  const refreshProperties = useCallback(async () => {
    agentApi.getPublicAgents().then(setAgentDirectory, () => setAgentDirectory(null));
    try {
      setProperties(await propertyApi.getProperties());
    } finally {
      setPropertiesLoading(false);
    }
  }, []);

  const refreshListings = useCallback(async () => {
    if (role !== "agent" && role !== "admin") return setListings([]);
    setListingsLoading(true);
    try {
      setListings(role === "admin" ? await adminApi.getAllProperties() : await propertyApi.getMyProperties());
      setListingsLoadedFor(role);
    } finally {
      setListingsLoading(false);
    }
  }, [role]);

  const refreshInquiries = useCallback(async () => {
    if (!role) return setInquiries([]);
    const loader = role === "admin" ? adminApi.getAllInquiries : role === "agent" ? agentApi.getAgentInquiries : inquiryApi.getMyInquiries;
    setInquiries(await loader());
  }, [role]);

  // Admin account actions (suspend, cancel a plan...) change what is public, so
  // reload public listings whenever the admin user list is refreshed
  useEffect(() => {
    refreshProperties().catch(() => {});
  }, [refreshProperties, users]);

  // Reload role-specific data whenever the signed-in account changes
  useEffect(() => {
    refreshListings().catch(() => {});
    refreshInquiries().catch(() => {});
  }, [userId, refreshListings, refreshInquiries]);

  useEffect(() => {
    if (userId && role === "user") userApi.getSavedProperties().then(setSavedIds).catch(() => {});
  }, [userId, role]);

  useEffect(() => void writeStorage(GUEST_FAVORITES_KEY, guestFavorites), [guestFavorites]);

  // After any listing change, refresh both the public list and the owner's list
  const refreshAfterChange = useCallback(async () => {
    await Promise.all([refreshProperties(), refreshListings()]);
  }, [refreshProperties, refreshListings]);

  const agents = useMemo(() => mergeAgents(agentDirectory, properties), [agentDirectory, properties]);
  const agentsLoading = propertiesLoading || agentDirectory === undefined;

  const addListing = useCallback(
    async (data) => {
      // Admins create HomeBase listings; agents go through the plan-limited endpoint
      const result = role === "admin" ? await adminApi.createAdminProperty(data) : await propertyApi.createProperty(data);
      await refreshAfterChange();
      return result;
    },
    [role, refreshAfterChange]
  );

  const updateListing = useCallback(
    async (id, changes) => {
      const result = role === "admin" ? await adminApi.updateAdminProperty(id, changes) : await propertyApi.updateProperty(id, changes);
      await refreshAfterChange();
      return result;
    },
    [role, refreshAfterChange]
  );

  const deleteListing = useCallback(
    async (id) => {
      await (role === "admin" ? adminApi.deleteProperty(id) : propertyApi.deleteProperty(id));
      await refreshAfterChange();
    },
    [role, refreshAfterChange]
  );

  // Admins moderate (approve/reject/hide); agents can only unpublish, withdraw or submit
  const setListingState = useCallback(
    async (id, state, extra = {}) => {
      if (role === "admin") await adminApi.setPropertyStatus(id, state, extra.rejectionReason);
      else await propertyApi.updateProperty(id, { listing: { state } });
      await refreshAfterChange();
    },
    [role, refreshAfterChange]
  );

  const setFeatured = useCallback(
    async (id, isFeatured) => {
      await (role === "admin" ? adminApi.setPropertyFeatured(id, isFeatured) : propertyApi.featureProperty(id, isFeatured));
      await refreshAfterChange();
    },
    [role, refreshAfterChange]
  );

  const recordView = useCallback((id) => {
    propertyApi.recordPropertyView(id).catch(() => {});
  }, []);

  const addInquiry = useCallback(
    async ({ propertyId, name, email, phone, message }) => {
      const inquiry = await inquiryApi.sendInquiry({ propertyId, name, email, phone, message });
      if (role) refreshInquiries().catch(() => {});
      return inquiry;
    },
    [role, refreshInquiries]
  );

  const updateInquiryStatus = useCallback(
    async (id, status) => {
      const updated = role === "admin" ? await adminApi.updateInquiryStatus(id, status) : await agentApi.updateAgentInquiryStatus(id, status);
      setInquiries((prev) => prev.map((inq) => (inq.id === id ? updated : inq)));
      return updated;
    },
    [role]
  );

  const findProperty = useCallback((id) => listings.find((p) => p.id === id) || properties.find((p) => p.id === id), [listings, properties]);
  const isPubliclyVisible = useCallback((property) => properties.some((p) => p.id === property.id), [properties]);

  const favorites = userId ? savedIds : guestFavorites;

  const toggleFavorite = useCallback(
    async (id) => {
      if (!userId) {
        setGuestFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
        return;
      }
      // Optimistic update, then trust the server's list
      setSavedIds((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
      try {
        setSavedIds(await userApi.toggleSavedProperty(id));
      } catch {
        setSavedIds(await userApi.getSavedProperties().catch(() => []));
      }
    },
    [userId]
  );

  const value = useMemo(
    () => ({
      properties,
      propertiesLoading,
      agents,
      agentsLoading,
      listings,
      listingsLoading,
      listingsReady: listingsLoadedFor === role,
      inquiries,
      isPubliclyVisible,
      findProperty,
      addListing,
      updateListing,
      deleteListing,
      setListingState,
      setFeatured,
      recordView,
      addInquiry,
      updateInquiryStatus,
      refreshProperties,
      refreshListings,
      refreshInquiries,
      refreshUser,
      favorites,
      isFavorite: (id) => favorites.includes(id),
      toggleFavorite,
    }),
    [
      properties,
      propertiesLoading,
      agents,
      agentsLoading,
      listings,
      listingsLoading,
      listingsLoadedFor,
      role,
      inquiries,
      isPubliclyVisible,
      findProperty,
      addListing,
      updateListing,
      deleteListing,
      setListingState,
      setFeatured,
      recordView,
      addInquiry,
      updateInquiryStatus,
      refreshProperties,
      refreshListings,
      refreshInquiries,
      refreshUser,
      favorites,
      toggleFavorite,
    ]
  );

  return <RealEstateContext.Provider value={value}>{children}</RealEstateContext.Provider>;
};
