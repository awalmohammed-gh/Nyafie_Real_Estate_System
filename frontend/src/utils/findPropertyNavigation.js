// The public catalogue uses status=Sale/Rent and configured property-type names.
export const buildFindPropertyLinks = (listingsPath, propertyTypes = []) => {
  const hotelTypes = propertyTypes.filter((type) => /^hotel(?:[- _]|$)/i.test(type));
  const hotels = hotelTypes.length ? hotelTypes : ['Hotel-Apartment'];
  return [
    { key: 'all', name: 'All Listings', path: listingsPath, description: 'Explore all available properties' },
    { key: 'sale', name: 'Buy a House', path: `${listingsPath}?status=Sale`, description: 'Homes currently available for sale' },
    { key: 'rent', name: 'Rent a House', path: `${listingsPath}?status=Rent`, description: 'Rental homes and apartments' },
    { key: 'hotels', name: 'Hotels', path: `${listingsPath}?${new URLSearchParams({ type: hotels.join(',') })}`, description: 'Hotel properties and serviced stays', hotelTypes: hotels },
  ];
};

// NavLink matches the pathname alone, so these links need query-aware selection.
export const isFindPropertyLinkActive = (link, pathname, search, listingsPath) => {
  if (pathname === '/sale') return link.key === 'sale';
  if (pathname === '/rent') return link.key === 'rent';
  if (pathname !== listingsPath) return false;
  const params = new URLSearchParams(search);
  const types = (params.get('type') || '').split(',').map((type) => type.toLowerCase());
  const isHotel = types.some((type) => /^hotel(?:[- _]|$)/i.test(type));
  if (isHotel) return link.key === 'hotels';
  if (params.get('status') === 'Sale') return link.key === 'sale';
  if (params.get('status') === 'Rent') return link.key === 'rent';
  return link.key === 'all';
};
