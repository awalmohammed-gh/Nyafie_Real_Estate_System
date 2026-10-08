import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { usePlatform } from '../../context/usePlatform';
import { PropertyCategoryCount, PropertyCategoryIcon } from '../property/PropertyCategoryCard';
import { propertyCategoryHref } from '../../utils/propertyCategories';

export const PropertyCategoryLinks = ({ categories, onNavigate, compact = false }) => {
  const { paths } = usePlatform();
  const { pathname, search } = useLocation();
  const selected = pathname === paths.listings ? (new URLSearchParams(search).get('type') || '').split(',') : [];
  const items = compact ? categories.items : categories.items.slice(0, 8);
  return (
    <ul className={compact ? 'space-y-0.5' : 'grid grid-cols-4 gap-3'} aria-label="Property styles">
      {items.map((category) => {
        const active = selected.includes(category.value);
        return (
          <li key={category.value}>
            <Link to={propertyCategoryHref(paths.listings, category.value)} onClick={onNavigate} aria-current={active ? 'page' : undefined}
              className={`group flex rounded-xl outline-offset-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500 ${compact ? 'min-h-11 items-center gap-3 px-3 py-2.5' : 'min-h-32 flex-col items-start border p-4'} ${active ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-gray-200/70 text-gray-700 hover:border-brand-200 hover:bg-brand-50/60 hover:text-brand-700 focus-visible:bg-brand-50/60'}`}>
              {!compact && <span className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-100"><PropertyCategoryIcon kind={category.icon} className="h-5 w-5" /></span>}
              <span className={`flex w-full items-center justify-between gap-2 text-sm ${compact ? 'font-medium' : 'font-semibold'}`}>{category.label}{!compact && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />}</span>
              {!compact && <span className="mt-1 text-xs text-gray-500"><PropertyCategoryCount count={category.count} /></span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

export const PropertyCategoryMenu = ({ categories, onNavigate, compact = false }) => {
  const { paths } = usePlatform();
  if (compact) return (
    <div className="pb-2"><PropertyCategoryLinks categories={categories} onNavigate={onNavigate} compact /><Link to={paths.properties} onClick={onNavigate} className="mt-2 flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-600 outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-500">All property styles <ArrowRight size={15} aria-hidden="true" /></Link></div>
  );
  return (
    <section className="p-6" aria-labelledby="nav-styles-heading">
      <div className="mb-5 flex items-start justify-between gap-6"><div><h2 id="nav-styles-heading" className="text-lg font-semibold tracking-tight text-gray-900">What does home look like to you?</h2><p className="mt-1 text-xs text-gray-500">Start with a property style. Discover the homes that fit.</p></div><span className="mt-1 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold whitespace-nowrap text-brand-700">Explore by type</span></div>
      <PropertyCategoryLinks categories={categories} onNavigate={onNavigate} />
      <div className="mt-5 flex items-center justify-between gap-4 border-t border-gray-100 pt-3"><p className="text-xs text-gray-500">{categories.items.length} property styles to explore</p><Link to={paths.properties} onClick={onNavigate} className="inline-flex min-h-11 items-center gap-2 rounded text-sm font-semibold text-brand-600 outline-offset-2 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">View all property styles <ArrowRight size={16} aria-hidden="true" /></Link></div>
      {categories.error && <p role="status" className="text-xs text-gray-500">Listing counts are unavailable. <button type="button" onClick={categories.reload} className="min-h-9 font-semibold text-brand-600">Try again</button></p>}
    </section>
  );
};
