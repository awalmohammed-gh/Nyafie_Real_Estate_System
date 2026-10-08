import PropertyBrowser from '../components/PropertyBrowser';
import NotFound from './NotFound';

const descriptions = {
  sale: "A space to call your own. Explore homes for sale and picture your next chapter.",
  rent: "Short stays or fresh starts. Find a rental that fits the way you live.",
};

// /sale and /rent (routed by SlugPage)
const PropertyPerPage = ({ status }) => {
  const key = status.toLowerCase();

  if (!descriptions[key]) return <NotFound />;

  return (
    <PropertyBrowser
      key={key}
      fixedListingType={key === 'sale' ? 'Sale' : 'Rent'}
      title={`Homes for ${key === 'sale' ? 'Sale' : 'Rent'}`}
      description={descriptions[key]}
    />
  );
};

export default PropertyPerPage;
