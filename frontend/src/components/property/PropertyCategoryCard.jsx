import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BedDouble, Building2, Home, Hotel } from 'lucide-react';
import { usePlatform } from '../../context/usePlatform';
import { propertyCategoryHref } from '../../utils/propertyCategories';
import { cloudImage } from '../../utils/cloudImage';

const ICONS = { building: Building2, home: Home, hotel: Hotel, tower: Building2, bed: BedDouble };

export const PropertyCategoryIcon = ({ kind, className = '' }) => {
  const Icon = ICONS[kind] || Building2;
  return <Icon className={className} aria-hidden="true" strokeWidth={1.5} />;
};

export const PropertyCategoryCount = ({ count }) => (
  <span>{count == null ? 'Explore listings' : count === 0 ? 'No listings yet' : `${count.toLocaleString()} ${count === 1 ? 'listing' : 'listings'}`}</span>
);

const PropertyCategoryCard = ({ category, compact = false }) => {
  const { paths } = usePlatform();
  const [failedImage, setFailedImage] = useState(null);
  const image = category.image && failedImage !== category.image;
  return (
    <Link to={propertyCategoryHref(paths.listings, category.value)} className={compact ? 'explore-style-tile' : 'explore-category-card'}>
      {compact ? <span className="explore-style-icon"><PropertyCategoryIcon kind={category.icon} /></span> : (
        <div className="explore-category-image">
          {image ? <img src={cloudImage(category.image, 320)} alt="" loading="lazy" decoding="async" onError={() => setFailedImage(category.image)} /> : <div className="explore-category-fallback"><PropertyCategoryIcon kind={category.icon} /></div>}
          <span className="explore-category-count"><PropertyCategoryCount count={category.count} /></span>
        </div>
      )}
      <div className={compact ? 'explore-style-copy' : 'explore-category-copy'}>
        <h3>{category.label}</h3>
        {compact ? <p><PropertyCategoryCount count={category.count} /></p> : <p>{category.description}</p>}
      </div>
      <span className={compact ? 'explore-style-arrow' : 'explore-category-action'}>{!compact && <span>Explore {category.label.toLowerCase()}</span>}<ArrowUpRight size={18} aria-hidden="true" /></span>
    </Link>
  );
};

export default PropertyCategoryCard;
