import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useRealEstate } from '../../context/useRealEstate';
import SectionHeading from '../ui/SectionHeading';
import Reveal from '../ui/Reveal';

// Bento layout: the first tile is large, the rest fill in around it
const tileClasses = [
  "sm:col-span-2 sm:row-span-2",
  "",
  "",
  "",
  "",
];

const Neighbourhoods = () => {
  const { properties, propertiesLoading } = useRealEstate();

  const neighbourhoods = Object.values(
    properties.reduce((acc, property) => {
      const name = property.location.name;
      acc[name] ??= { name, city: property.location.city, image: property.media.images[0], count: 0, views: 0 };
      acc[name].count += 1;
      acc[name].views += property.meta?.views || 0;
      return acc;
    }, {})
  )
    .sort((a, b) => b.count - a.count || b.views - a.views)
    .slice(0, 5);

  if (propertiesLoading && properties.length === 0) return null;

  return (
    <section className="bg-gray-50 py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          eyebrow="Locations"
          title="Explore by"
          highlight="Neighbourhood"
          description="From the calm of Aburi to the buzz of Airport City, find homes in the areas you love."
        />

        <div className="grid auto-rows-[13rem] gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[15rem]">
          {neighbourhoods.map((place, index) => (
            <Reveal key={place.name} delay={index * 0.06} className={`h-full ${tileClasses[index] || ""}`}>
              <Link
                to={`/properties?area=${encodeURIComponent(place.name)}`}
                className="group relative block h-full overflow-hidden rounded-3xl bg-gray-200"
              >
                <img
                  src={place.image}
                  alt={place.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-linear-to-t from-gray-950/80 via-gray-950/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                  <div>
                    <h3 className="text-xl font-bold text-white">{place.name}</h3>
                    <p className="text-sm text-gray-300">
                      {place.city} · {place.count} {place.count === 1 ? "property" : "properties"}
                    </p>
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition group-hover:bg-white group-hover:text-gray-900">
                    <ArrowUpRight className="h-5 w-5" />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Neighbourhoods;
