import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { propertyApi } from '../../frontApi';
import { useApiQuery } from '../../hooks/useApiQuery';
import HouseCard from '../card/HouseCard';
import SectionHeading from '../ui/SectionHeading';
import Reveal from '../ui/Reveal';
import SkeletonGrid from '../ui/SkeletonGrid';
import { usePlatform } from "../../context/usePlatform";

const FeatureListings = () => {
  const { paths } = usePlatform();
  // Featured listings (isFeatured) first, then the highest rated, straight from the database
  const featured = useApiQuery('home-featured', () => propertyApi.searchProperties({ sort: 'featured', limit: 6 }));
  const displayProperties = featured.data?.items || [];

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
            <Link to={paths.listings} className="btn btn-light">
              View All Properties
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />

        {featured.loading ? (
          <SkeletonGrid count={3} />
        ) : featured.error ? (
          <div role="alert" className="rounded-3xl bg-red-50 px-6 py-12 text-center">
            <p className="font-semibold text-gray-900">Unable to load properties</p>
            <p className="mt-1 text-sm text-gray-600">Something went wrong while loading the properties.</p>
            <button onClick={featured.reload} className="btn btn-primary mt-5">Retry</button>
          </div>
        ) : displayProperties.length === 0 ? (
          <div className="rounded-3xl bg-gray-50 px-6 py-14 text-center">
            <p className="font-semibold text-gray-900">No properties available</p>
            <p className="mt-1 text-sm text-gray-500">Properties added to the system will appear here.</p>
          </div>
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
