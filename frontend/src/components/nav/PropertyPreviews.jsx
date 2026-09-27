import { Link } from 'react-router-dom';
import { ArrowRight, Home, MapPin, RotateCcw } from 'lucide-react';
import { PREVIEW_LIMIT } from '../../hooks/useNavPropertyPreviews';
import { usePlatform } from '../../context/usePlatform';
import { formatLocation, getPriceParts, statusLabel } from '../../utils/property';

// Previews of live listings for the navbar's Properties menu (data from useNavPropertyPreviews)

const TypeBadge = ({ status }) => (
  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
    <span className={`h-1.5 w-1.5 rounded-full ${status === 'Sale' ? 'bg-emerald-500' : 'bg-sky-500'}`} />
    {statusLabel(status)}
  </span>
);

const Price = ({ property, className = '' }) => {
  const { value, period } = getPriceParts(property);
  return (
    <p className={`font-bold text-gray-900 ${className}`}>
      {value}
      {period && <span className="text-xs font-medium text-gray-500">{period}</span>}
    </p>
  );
};

const Thumb = ({ property, className }) =>
  property.media.images[0] ? (
    <img src={property.media.images[0]} alt="" loading="lazy" decoding="async" className={`object-cover ${className}`} />
  ) : (
    <span className={`grid place-items-center bg-gray-100 text-gray-300 ${className}`}>
      <Home className="h-6 w-6" />
    </span>
  );

const StateMessage = ({ status, onRetry, compact }) => (
  <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-6' : 'py-12'}`}>
    {status === 'error' ? (
      <>
        <p className="text-sm font-semibold text-gray-900">Couldn't load properties</p>
        <button type="button" onClick={onRetry} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
          <RotateCcw className="h-3.5 w-3.5" />
          Try again
        </button>
      </>
    ) : (
      <>
        <p className="text-sm font-semibold text-gray-900">No properties available</p>
        <p className="mt-1 text-sm text-gray-500">New listings will appear here once they're published.</p>
      </>
    )}
  </div>
);

const ViewAllLink = ({ onNavigate, className = '' }) => {
  const { paths } = usePlatform();
  return (
  <Link
    to={paths.properties}
    onClick={onNavigate}
    className={`group inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 ${className}`}
  >
    View All Properties
    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
  </Link>
  );
};

// Desktop mega-menu body: a row of property cards
export const PropertyPreviewGrid = ({ previews, onNavigate }) => {
  const { status, items, reload } = previews;
  const loading = status === 'idle' || status === 'loading';

  return (
    <div>
      <div className="border-b border-gray-100 px-6 py-4">
        <p className="text-sm font-semibold text-gray-900">Featured properties</p>
        <p className="text-xs text-gray-500">A quick look at homes available right now</p>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="grid grid-cols-4 gap-5" aria-busy="true" aria-label="Loading properties">
            {Array.from({ length: PREVIEW_LIMIT }, (_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-4/3 rounded-lg bg-gray-100" />
                <div className="mt-3 h-3 w-1/3 rounded bg-gray-100" />
                <div className="mt-2 h-4 w-3/4 rounded bg-gray-100" />
                <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : items.length ? (
          <ul className="grid grid-cols-4 gap-5">
            {items.map((property) => (
              <li key={property.id}>
                <Link to={`/house/${property.id}`} onClick={onNavigate} className="group block rounded-lg outline-offset-4">
                  <div className="relative aspect-4/3 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-900/5">
                    <Thumb property={property} className="h-full w-full transition duration-500 group-hover:scale-[1.03]" />
                    {property.listing.availability === 'Under Offer' && (
                      <span className="absolute top-2 left-2 rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-amber-700 shadow-sm">
                        Under Offer
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    <TypeBadge status={property.property.status} />
                    <p className="mt-1 truncate text-sm font-semibold text-gray-900 transition-colors group-hover:text-brand-600">{property.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{formatLocation(property.location)}</span>
                    </p>
                    <Price property={property} className="mt-2 text-sm" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <StateMessage status={status} onRetry={reload} />
        )}
      </div>

      <div className="flex justify-end border-t border-gray-100 bg-gray-50/60 px-6 py-3">
        <ViewAllLink onNavigate={onNavigate} />
      </div>
    </div>
  );
};

// Mobile drawer body: a compact vertical list
export const PropertyPreviewList = ({ previews, onNavigate }) => {
  const { status, items, reload } = previews;
  const loading = status === 'idle' || status === 'loading';

  return (
    <div className="pb-2">
      {loading ? (
        <ul className="space-y-1" aria-busy="true" aria-label="Loading properties">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="flex animate-pulse items-center gap-3 px-3 py-2">
              <div className="h-14 w-16 shrink-0 rounded-lg bg-gray-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-3/4 rounded bg-gray-100" />
                <div className="h-3 w-1/2 rounded bg-gray-100" />
              </div>
            </li>
          ))}
        </ul>
      ) : items.length ? (
        <ul>
          {items.map((property) => (
            <li key={property.id}>
              <Link to={`/house/${property.id}`} onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-gray-50">
                <Thumb property={property} className="h-14 w-16 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{property.title}</span>
                  <span className="block truncate text-xs text-gray-500">{formatLocation(property.location)}</span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <Price property={property} className="text-sm" />
                    <TypeBadge status={property.property.status} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <StateMessage status={status} onRetry={reload} compact />
      )}
      <ViewAllLink onNavigate={onNavigate} className="mt-1 px-3 py-2" />
    </div>
  );
};
