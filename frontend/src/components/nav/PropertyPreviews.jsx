import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, MapPin, RotateCcw } from 'lucide-react';
import { PREVIEW_LIMIT } from '../../hooks/useNavPropertyPreviews';
import { formatLocation, getPriceParts } from '../../utils/property';

const Price = ({ property }) => {
  const { value, period } = getPriceParts(property);
  return (
    <p className="mt-2 text-sm font-bold text-gray-900">
      {value}
      {period && <span className="text-xs font-medium text-gray-500">{period}</span>}
    </p>
  );
};

const Thumb = ({ property, interactive = false }) => {
  const src = property.media?.images?.[0];
  const [failedSrc, setFailedSrc] = useState(null);
  return src && failedSrc !== src ? (
    <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} className={`h-full w-full object-cover ${interactive ? 'motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.03] motion-safe:group-focus-visible:scale-[1.03]' : ''}`} />
  ) : (
    <span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-100 text-gray-400">
      <Home aria-hidden="true" className="h-6 w-6" />
      <span className="text-xs">Photo coming soon</span>
    </span>
  );
};

export const FeaturedProperties = ({ previews, onNavigate, wide = false }) => {
  const { status, items, reload } = previews;
  const loading = status === 'idle' || status === 'loading';
  if (loading) {
    return (
      <div className={`grid gap-4 ${wide ? 'grid-cols-2' : 'grid-cols-1 xl:grid-cols-2'}`} aria-busy="true" aria-label="Loading featured properties">
        {Array.from({ length: PREVIEW_LIMIT }, (_, i) => (
          <div key={i} className={`motion-safe:animate-pulse ${i && !wide ? 'hidden xl:block' : ''}`}>
            <div className="aspect-[3/2] rounded-lg bg-gray-200/60" />
            <div className="mt-3 h-4 w-3/4 rounded bg-gray-200/60" />
            <div className="mt-2 h-3 w-1/2 rounded bg-gray-200/60" />
            <div className="mt-3 h-4 w-2/3 rounded bg-gray-200/60" />
          </div>
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="flex min-h-40 flex-col justify-center text-sm" role="status">
        <p className="font-medium text-gray-700">{status === 'error' ? "Couldn't load properties" : 'New homes coming soon'}</p>
        {status === 'error' ? (
          <button type="button" onClick={reload} className="mt-2 inline-flex min-h-11 items-center gap-2 self-start font-semibold text-brand-600 hover:text-brand-700">
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Try again
          </button>
        ) : <p className="mt-1 text-xs leading-relaxed text-gray-500">Use the links to explore all available listings.</p>}
      </div>
    );
  }
  return (
    <ul className={`grid gap-4 ${wide ? 'grid-cols-2' : 'grid-cols-1 xl:grid-cols-2'}`}>
      {items.slice(0, PREVIEW_LIMIT).map((property, index) => (
        <li key={property.id} className={index && !wide ? 'hidden xl:block' : ''}>
          {/* -m-2 p-2 gives the hover highlight room without moving the layout */}
          <Link to={`/house/${property.id}`} onClick={onNavigate} className="group -m-2 block rounded-xl p-2 ring-1 ring-transparent outline-offset-2 transition-[background-color,box-shadow] duration-200 hover:bg-white hover:shadow-sm focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-brand-500 motion-reduce:transition-none">
            <div className="relative aspect-[3/2] overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-900/5">
              <Thumb property={property} interactive={wide} />
              {wide && <span className="absolute top-2 left-2 rounded-md bg-white/95 px-2 py-1 text-[10px] font-semibold text-gray-800">{property.property.status === 'Sale' ? 'For sale' : 'To rent'}</span>}
            </div>
            <p className="mt-3 truncate text-sm font-semibold text-gray-900 transition-colors group-hover:text-brand-600 group-focus-visible:text-brand-600" title={property.title}>{property.title}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{formatLocation(property.location)}</span>
            </p>
            <Price property={property} />
          </Link>
        </li>
      ))}
    </ul>
  );
};
