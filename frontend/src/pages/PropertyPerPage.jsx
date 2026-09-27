import PropertyBrowser from '../components/PropertyBrowser';
import NotFound from './NotFound';

const descriptions = {
  sale: "Explore our properties available for sale. Whether you're looking to buy your dream home or invest, find listings with detailed information, photos, and features to help you make the best choice.",
  rent: "Explore our properties available for rent. From short stays to long-term leases, find a place that fits your lifestyle and budget.",
};

// /sale and /rent (routed by SlugPage)
const PropertyPerPage = ({ status }) => {
  const key = status.toLowerCase();

  if (!descriptions[key]) return <NotFound />;

  return (
    <PropertyBrowser
      key={key}
      fixedListingType={key === 'sale' ? 'Sale' : 'Rent'}
      title={`For ${status} Properties`}
      description={descriptions[key]}
      heroImage="/cateHeroImg.jpg"
    />
  );
};

export default PropertyPerPage;
