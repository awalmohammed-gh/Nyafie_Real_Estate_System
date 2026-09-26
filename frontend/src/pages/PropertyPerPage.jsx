import { useParams } from 'react-router-dom';
import { useRealEstate } from '../context/useRealEstate';
import PropertyBrowser from '../components/PropertyBrowser';
import NotFound from './NotFound';

const descriptions = {
  sale: "Explore our properties available for sale. Whether you're looking to buy your dream home or invest, find listings with detailed information, photos, and features to help you make the best choice.",
  rent: "Explore our properties available for rent. From short stays to long-term leases, find a place that fits your lifestyle and budget.",
};

const PropertyPerPage = () => {
  const { status } = useParams();
  const { properties } = useRealEstate();
  const key = status.toLowerCase();

  if (!descriptions[key]) return <NotFound />;

  const propertyPage = properties.filter((item) => item.property.status.toLowerCase() === key);

  return (
    <PropertyBrowser
      key={key}
      properties={propertyPage}
      title={`For ${status} Properties`}
      description={descriptions[key]}
      heroImage="/cateHeroImg.jpg"
    />
  );
};

export default PropertyPerPage;
