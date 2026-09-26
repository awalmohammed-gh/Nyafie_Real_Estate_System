import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useRealEstate } from '../../context/useRealEstate';
import HouseCard from '../card/HouseCard';
import SectionHeading from '../ui/SectionHeading';
import Reveal from '../ui/Reveal';
import SkeletonGrid from '../ui/SkeletonGrid';

const FeatureListings = () => {
  const { properties, propertiesLoading } = useRealEstate();

  // Featured listings first, then the highest rated
  const displayProperties = [...properties]
    .sort(
      (a, b) =>
        Number(!!b.meta?.isFeatured) - Number(!!a.meta?.isFeatured) ||
        (b.meta?.rating || 0) - (a.meta?.rating || 0)
    )
    .slice(0, 6);

  return (
    <section className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          align="left"
          eyebrow="Properties"
          title="Featured"
          highlight="Listings"
          description="Discover our handpicked selection of premium properties"
          action={
            <Link to="/listings" className="btn btn-light">
              View All Properties
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />

        {propertiesLoading ? (
          <SkeletonGrid count={3} />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {displayProperties.map((house, index) => (
              <Reveal key={house.id} delay={(index % 3) * 0.08} className="h-full">
                <HouseCard house={house} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default FeatureListings;
