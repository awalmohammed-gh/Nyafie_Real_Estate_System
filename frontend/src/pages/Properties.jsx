import { useSearchParams } from 'react-router-dom';
import PropertyBrowser from '../components/PropertyBrowser';

// Server-side property search; the Hero search and neighbourhood tiles link here with
// ?status=, ?area= and ?type= to pre-fill the filters.
const Properties = () => {
  const [searchParams] = useSearchParams();

  const status = searchParams.get('status') || '';
  const area = searchParams.get('area') || '';
  const type = searchParams.get('type') || '';
  const isSearch = Boolean(status || area || type);

  return (
    <PropertyBrowser
      key={searchParams.toString()}
      title={isSearch ? 'Search Results' : 'All Properties'}
      description={
        isSearch
          ? `Homes${type ? ` of type ${type.replace(/-/g, ' ')}` : ''}${area ? ` in ${area}` : ''}${status ? ` for ${status.toLowerCase()}` : ''}. Adjust the filters to widen your search.`
          : 'Browse every property we have available for sale and rent.'
      }
      heroImage="/listBg.jpg"
      initialFilters={{ listingType: status, area, types: type ? [type] : [] }}
    />
  );
};

export default Properties;
