// Placeholder cards shown while listings load (same footprint as HouseCard)
const SkeletonGrid = ({ count = 6, className = "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" }) => (
  <div className={className} aria-busy="true" aria-label="Loading properties">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="overflow-hidden rounded-3xl bg-white ring-1 ring-gray-200/80">
        <div className="aspect-4/3 animate-pulse bg-gray-100" />
        <div className="space-y-3 p-5">
          <div className="h-3 w-24 animate-pulse rounded-full bg-gray-100" />
          <div className="h-5 w-3/4 animate-pulse rounded-full bg-gray-100" />
          <div className="h-3 w-1/2 animate-pulse rounded-full bg-gray-100" />
          <div className="h-8 animate-pulse rounded-xl bg-gray-50" />
        </div>
      </div>
    ))}
  </div>
);

export default SkeletonGrid;
