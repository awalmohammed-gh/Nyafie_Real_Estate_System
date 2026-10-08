import { useMemo } from 'react';
import { usePlatform } from '../context/usePlatform';
import { useRealEstate } from '../context/useRealEstate';
import { usePropertyFacets } from './usePropertyFacets';
import { buildPropertyCategories } from '../utils/propertyCategories';

// Navbar and discovery page share the existing facets cache and public property data.
export const usePropertyCategories = () => {
  const { settings } = usePlatform();
  const { properties } = useRealEstate();
  const facets = usePropertyFacets();
  const items = useMemo(
    () => buildPropertyCategories(settings.property.propertyTypes, facets.data?.types, properties),
    [settings.property.propertyTypes, facets.data?.types, properties]
  );
  return { items, total: facets.data?.total, loading: facets.loading, error: facets.error, reload: facets.reload };
};
