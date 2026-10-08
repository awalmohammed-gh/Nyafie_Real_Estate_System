import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import AccountShell from "../../components/account/AccountShell";
import HouseCard from "../../components/card/HouseCard";
import EmptyState from "../../components/ui/EmptyState";
import Reveal from "../../components/ui/Reveal";
import SkeletonGrid from "../../components/ui/SkeletonGrid";
import { useRealEstate } from "../../context/useRealEstate";
import { propertyApi } from "../../frontApi";
import { useApiQuery } from "../../hooks/useApiQuery";
import { usePlatform } from "../../context/usePlatform";

const SavedProperties = () => {
  const { paths } = usePlatform();
  const { favorites } = useRealEstate();
  // Fetch exactly the saved listings; ones that were removed or unpublished simply don't come back
  const ids = [...favorites].sort().slice(0, 48);
  const saved = useApiQuery(`saved:${ids.join(",")}`, () =>
    ids.length ? propertyApi.searchProperties({ ids, limit: 48, sort: "latest" }) : Promise.resolve({ items: [] })
  );
  const items = (saved.data || saved.previous)?.items || []; // previous list stays while an unsave reloads

  return (
    <AccountShell title="Saved Properties" description="Homes you've saved with the heart button.">
      {saved.loading && !saved.previous ? (
        <SkeletonGrid count={3} className="customer-saved-grid" />
      ) : saved.error ? (
        <div role="alert" className="rounded-3xl bg-red-50 px-6 py-12 text-center">
          <p className="font-semibold text-gray-900">Unable to load your saved properties</p>
          <p className="mt-1 text-sm text-gray-600">Something went wrong while loading the properties.</p>
          <button onClick={saved.reload} className="btn btn-primary mt-5">Retry</button>
        </div>
      ) : items.length ? (
        <div className="customer-saved-grid">
          {items.map((property, index) => (
            <Reveal key={property.id} delay={(index % 3) * 0.06} className="h-full">
              <HouseCard house={property} />
            </Reveal>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Heart}
          title="No saved properties yet"
          description="Tap the heart on any property to save it here for later."
          action={<Link to={paths.listings} className="btn btn-primary">Browse listings</Link>}
        />
      )}
    </AccountShell>
  );
};

export default SavedProperties;
