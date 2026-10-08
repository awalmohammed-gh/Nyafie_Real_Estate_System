import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Building2, Home, Hotel, KeyRound } from 'lucide-react';
import { usePlatform } from '../../context/usePlatform';
import { isFindPropertyLinkActive } from '../../utils/findPropertyNavigation';
import { FeaturedProperties } from './PropertyPreviews';

const LINK_ICONS = { all: Building2, sale: Home, rent: KeyRound, hotels: Hotel };

export const FindPropertyLinks = ({ links, onNavigate, compact = false }) => {
  const { pathname, search } = useLocation();
  const { paths } = usePlatform();
  return (
    <ul className={compact ? 'space-y-0.5' : 'mt-4 space-y-1'} aria-label="Explore properties">
      {links.map((link) => {
        const active = isFindPropertyLinkActive(link, pathname, search, paths.listings);
        const Icon = LINK_ICONS[link.key];
        return (
          <li key={link.key}>
            <Link
              to={link.path}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`group flex min-h-11 items-center gap-3 rounded-lg outline-offset-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500 ${compact ? 'px-3 py-2.5' : 'px-3 py-3'} ${active ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-brand-50/70 hover:text-brand-700 focus-visible:bg-brand-50/70'}`}
            >
              {!compact && <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-500 group-hover:bg-brand-100/70 group-hover:text-brand-600'}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>}
              <span className="min-w-0 flex-1"><span className={`block text-sm ${active || !compact ? 'font-semibold' : 'font-medium'}`}>{link.name}</span>{!compact && <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500">{link.description}</span>}</span>
              {!compact && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-gray-400 group-hover:text-brand-600" aria-hidden="true" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

export const FindPropertyMegaMenu = ({ links, previews, onNavigate }) => {
  const { paths } = usePlatform();
  return (
    <div className="grid grid-cols-[17.5rem_minmax(0,1fr)]">
      <section className="p-5" aria-labelledby="nav-find-heading">
        <div className="px-3 pt-1"><h2 id="nav-find-heading" className="text-base font-semibold tracking-tight text-gray-900">Explore properties</h2><p className="mt-1 text-xs leading-relaxed text-gray-500">Find a place for your next chapter.</p></div>
        <FindPropertyLinks links={links} onNavigate={onNavigate} />
      </section>
      <section className="min-w-0 border-l border-gray-100 bg-gray-50/60 p-6" aria-labelledby="nav-find-featured-heading">
        <div className="flex items-center justify-between gap-4"><h2 id="nav-find-featured-heading" className="text-base font-semibold tracking-tight text-gray-900">Featured homes</h2><Link to={paths.listings} onClick={onNavigate} className="inline-flex min-h-9 items-center gap-1.5 rounded text-xs font-semibold text-brand-600 outline-offset-4 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></div>
        <p className="mt-1 text-xs text-gray-500">A few places worth a closer look.</p>
        <div className="mt-5"><FeaturedProperties previews={previews} onNavigate={onNavigate} wide /></div>
      </section>
    </div>
  );
};
