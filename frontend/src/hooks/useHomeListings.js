import { useMemo } from "react";
import { propertyApi } from "../frontApi";
import { useApiQuery } from "./useApiQuery";
import { useRealEstate } from "../context/useRealEstate";
import { isHotel } from "../utils/hotel";

const isActive = (house) => !["Sold", "Rented"].includes(house.listing?.availability);
const newestFirst = (a, b) => new Date(b.listing?.createdAt || 0) - new Date(a.listing?.createdAt || 0);

// Prefer listings no other homepage section shows yet, then fill up with the rest
const pick = (items, count, shown) => {
  const fresh = items.filter((house) => !shown.has(house.id));
  const chosen = [...fresh, ...items.filter((house) => shown.has(house.id))].slice(0, count);
  chosen.forEach((house) => shown.add(house.id));
  return chosen;
};

/**
 * Every homepage property section in one place. Featured listings come from one sorted search;
 * rentals, sales, hotels and recent listings are selected from the public listings the app
 * already loads (RealEstateProvider), so the homepage adds a single request for properties.
 */
export const useHomeListings = () => {
  const { properties, propertiesLoading } = useRealEstate();
  const featured = useApiQuery("home-featured", () => propertyApi.searchProperties({ sort: "featured", availability: "Available", limit: 8 }));

  const sections = useMemo(() => {
    const featuredItems = featured.data?.items || [];
    const active = properties.filter((house) => house.listing?.state === "published" && isActive(house) && house.media?.images?.length);
    const shown = new Set(featuredItems.map((house) => house.id));
    const homes = active.filter((house) => !isHotel(house));
    const hotels = active.filter(isHotel).filter((house) => house.roomTypes?.some((room) => room.active));
    return {
      featured: featuredItems,
      rentals: pick(homes.filter((house) => house.property.status === "Rent"), 3, shown),
      sales: pick(homes.filter((house) => house.property.status === "Sale"), 3, shown),
      hotels: pick(hotels, 3, shown),
      recent: pick([...active].sort(newestFirst), 4, shown),
    };
  }, [featured.data, properties]);

  return { ...sections, featuredQuery: featured, loading: propertiesLoading };
};
