import { useParams } from "react-router-dom";
import PropertyBrowser from "../components/PropertyBrowser";
import PageLoader from "../components/ui/PageLoader";
import NotFound from "./NotFound";
import { usePropertyFacets } from "../hooks/usePropertyFacets";
import { findPlace } from "../utils/places";

/**
 * A location page: /rent/east-legon, /sale/accra. The homes for sale or rent in one neighbourhood or
 * city, at an address people (and search engines) can find: "houses for rent in East Legon".
 * The server gives the page its title, description and structured data (backend routes/seoRoutes.js).
 */
const PlaceListings = ({ status }) => {
  const { place: slug } = useParams();
  const listingType = status === "sale" ? "Sale" : "Rent";
  const facets = usePropertyFacets(listingType);
  if (!facets.data) return facets.error ? <NotFound /> : <PageLoader label="Loading homes..." />;
  const place = findPlace(facets.data, slug);
  if (!place) return <NotFound />;
  const words = listingType === "Sale" ? "for Sale" : "for Rent";
  return (
    <PropertyBrowser
      key={`${status}:${slug}`}
      fixedListingType={listingType}
      place={place}
      title={`Homes ${words} in ${place.label}`}
      description={`Houses and apartments ${words.toLowerCase()} in ${place.label}, with photos, prices and trusted agents.`}
    />
  );
};

export default PlaceListings;
