import PropertyBrowser from '../components/PropertyBrowser';

const banner = {
  heading: 'Explore all listings',
  image: { src: '/banners/listings-suburb.jpg', srcSet: '/banners/listings-suburb-960.jpg 960w, /banners/listings-suburb.jpg 1920w', position: 'center 45%' },
};

// Every published listing, searched and paginated on the server. The banner names the active filters.
const Listings = () => (
  <PropertyBrowser
    title="All Listings"
    description="Browse available properties and discover homes, apartments and spaces to buy or rent across Ghana."
    banner={banner}
  />
);

export default Listings;
