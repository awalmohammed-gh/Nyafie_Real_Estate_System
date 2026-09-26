import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import AccountShell from "../../components/account/AccountShell";
import HouseCard from "../../components/card/HouseCard";
import EmptyState from "../../components/ui/EmptyState";
import Reveal from "../../components/ui/Reveal";
import SkeletonGrid from "../../components/ui/SkeletonGrid";
import { useRealEstate } from "../../context/useRealEstate";

const SavedProperties = () => {
  const { properties, propertiesLoading, favorites } = useRealEstate();
  const saved = properties.filter((p) => favorites.includes(p.id));

  return (
    <AccountShell title="Saved Properties" description="Homes you've saved with the heart button.">
      {propertiesLoading ? (
        <SkeletonGrid count={3} />
      ) : saved.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="No saved properties yet"
          description="Tap the heart on any property to save it here for later."
          action={<Link to="/listings" className="btn btn-primary">Browse listings</Link>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((property, index) => (
            <Reveal key={property.id} delay={(index % 3) * 0.06} className="h-full">
              <HouseCard house={property} />
            </Reveal>
          ))}
        </div>
      )}
    </AccountShell>
  );
};

export default SavedProperties;
