import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Search, X } from 'lucide-react';
import { usePlatform } from '../context/usePlatform';
import { usePropertyCategories } from '../hooks/usePropertyCategories';
import { propertyDiscoveryRedirect } from '../utils/propertyCategories';
import PropertyCategoryCard from '../components/property/PropertyCategoryCard';
import PropertiesBanner from '../components/property/PropertiesBanner';
import './properties-discovery.css';

const PropertyDiscovery = () => {
  const { paths } = usePlatform();
  const categories = usePropertyCategories();
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const filtered = categories.items.filter((category) => `${category.label} ${category.value}`.toLowerCase().includes(term));
  const main = term ? filtered : filtered.slice(0, 6);
  const more = term ? [] : filtered.slice(6);

  return (
    <div className="properties-discovery">
      <PropertiesBanner styleCount={categories.items.length} listingCount={categories.total} />

      <section id="property-styles" className="container-page explore-styles" aria-labelledby="explore-styles-title">
        <div className="explore-section-heading"><div><p className="explore-eyebrow">Begin with your kind of space</p><h2 id="explore-styles-title">Explore the possibilities.</h2></div><form role="search" className="explore-type-search" onSubmit={(event) => event.preventDefault()}><Search size={17} aria-hidden="true" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a property style" aria-label="Search property styles" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Clear property style search"><X size={16} aria-hidden="true" /></button>}</form></div>
        <div className="explore-results-note" role="status" aria-live="polite" aria-atomic="true">{term ? `${filtered.length} ${filtered.length === 1 ? 'style' : 'styles'} matching “${search.trim()}”` : 'Choose a style to explore its listings.'}</div>
        {categories.error && <div className="explore-count-error" role="status"><p>Listing counts are unavailable. You can still explore each property style.</p><button type="button" onClick={categories.reload}>Refresh counts <ArrowRight size={14} aria-hidden="true" /></button></div>}
        {main.length ? <div className="explore-category-grid">{main.map((category) => <PropertyCategoryCard key={category.value} category={category} />)}</div> : <div className="explore-empty"><Search size={28} aria-hidden="true" /><h3>{term ? 'A different style, perhaps?' : 'New property styles are on their way.'}</h3><p>{term ? 'Try apartments, villas or another property type.' : 'Browse available homes while we prepare our property collections.'}</p>{term ? <button type="button" onClick={() => setSearch('')} className="explore-primary">Show all property styles</button> : <Link to={paths.listings} className="explore-primary">Browse all listings <ArrowUpRight size={17} aria-hidden="true" /></Link>}</div>}
        {more.length > 0 && <div className="explore-more"><div className="explore-section-heading"><div><p className="explore-eyebrow">Keep an open mind</p><h2>More ways to feel at home.</h2></div></div><div className="explore-more-grid">{more.map((category) => <PropertyCategoryCard key={category.value} category={category} compact />)}</div></div>}
      </section>

      <section className="container-page explore-bottom-wrap"><div className="explore-bottom"><div><p className="explore-eyebrow">Ready to narrow it down?</p><h2>Your style. Your budget. Your next home.</h2><p>Bring it all together with our full property search.</p></div><Link to={paths.listings} className="explore-primary">Find a property <ArrowUpRight size={18} aria-hidden="true" /></Link></div></section>
    </div>
  );
};

const Properties = () => {
  const { paths } = usePlatform();
  const { search, hash } = useLocation();
  const redirect = propertyDiscoveryRedirect(paths.listings, search, hash);
  return redirect ? <Navigate to={redirect} replace /> : <PropertyDiscovery />;
};

export default Properties;
