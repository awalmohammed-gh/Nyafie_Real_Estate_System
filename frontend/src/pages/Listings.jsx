import { useRealEstate } from '../context/useRealEstate';
import PropertyBrowser from '../components/PropertyBrowser';

const Listings = () => {
  const { properties } = useRealEstate();

  return (
    <PropertyBrowser
      properties={properties}
      title="All Listings"
      description="Explore our full range of properties for sale and rent. Find listings with detailed information, photos, and features to help you make the best choice."
      heroImage="/listBg.jpg"
    />
  );
};

export default Listings;
