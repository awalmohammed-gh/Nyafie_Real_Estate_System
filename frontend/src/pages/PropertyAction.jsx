import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Bath, Bed, BadgeCheck, Building2, CheckCircle2, MapPin, Maximize2, MessageCircle } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { usePlatform } from "../context/usePlatform";
import { propertyApi } from "../frontApi";
import PageLoader from "../components/ui/PageLoader";
import StatusBadge from "../components/ui/StatusBadge";
import WhatsAppIcon from "../components/ui/WhatsAppIcon";
import StartChatModal from "../components/chat/StartChatModal";
import { SignInPrompt } from "../components/property/SignInRequiredModal";
import OfferForm from "../components/offer/OfferForm";
import RentalCheckout from "../components/offer/RentalCheckout";
import HotelCheckout from "../components/offer/HotelCheckout";
import { isHotel } from "../utils/hotel";
import BuyNowPanel from "../components/offer/BuyNowPanel";
import NotFound from "./NotFound";
import { formatType, getPriceParts, statusLabel } from "../utils/property";
import { buildWhatsAppLink, ownerWhatsAppNumber } from "../utils/whatsapp";
import { propertyUrl } from "../utils/siteUrl";

const COPY = {
  rent: { title: "Proceed with Rental", intro: "Confirm availability with the agent, then review your rental details and total before paying online." },
  buy: { title: "Discuss This Property", intro: "Contact the listing agent, negotiate with an offer, or register your interest. Agree on the final amount and sale arrangements directly with the agent or owner." },
  offer: { title: "Make an Offer", intro: "Propose your price. The owner can accept, decline or counter, and you can negotiate in chat." },
};

/**
 * /checkout/rent/:propertyId  -> Rent Now (rental checkout + Paystack)
 * /checkout/buy/:propertyId   -> Buy Now (purchase request, pay at the office)
 * /make-offer/:propertyId     -> Make Offer (sale or rental)
 * Loads the property from the backend; signed-in customers only.
 */
const PropertyAction = ({ mode }) => {
  const { propertyId } = useParams();
  const location = useLocation();
  const { ready, user } = useAuth();
  const { settings } = usePlatform();
  const [property, setProperty] = useState(undefined); // undefined = loading, null = not found
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    let active = true;
    propertyApi
      .getPropertyById(propertyId)
      .then((p) => active && setProperty(p))
      .catch(() => active && setProperty(null));
    return () => {
      active = false;
    };
  }, [propertyId]);

  if (!ready || property === undefined) return <PageLoader label="Loading property..." />;
  if (!property) return <NotFound message="This property doesn't exist or is no longer listed." />;

  const { title, location: place, property: details, features, media } = property;
  const { value, period } = getPriceParts(property);
  const isForSale = details.status === "Sale";
  const hotel = isHotel(property);
  const isAdminListing = property.owner.type === "admin";
  const ownerName = isAdminListing ? settings.general.siteName : property.agent.name;
  const contactLabel = isAdminListing ? "Owner" : "Agent";
  const availability = property.listing.availability;
  const isOwnListing = Boolean(user) && ((isAdminListing && user.role === "admin") || property.ownerUserId === user.id);
  const whatsappNumber = ownerWhatsAppNumber(property, settings);
  const whatsappLink = buildWhatsAppLink(whatsappNumber, property, propertyUrl(property.id, settings));

  // Rent Now only fits rentals, Buy Now only fits sales
  const wrongType = (mode === "rent" && isForSale) || (mode === "buy" && !isForSale);
  const available = mode === "rent" ? availability === "Available" : mode === "buy" ? availability !== "Sold" : !["Sold", "Rented"].includes(availability);

  const specs = [
    !hotel && details.bedrooms != null && { icon: Bed, label: "Bedrooms", value: details.bedrooms },
    !hotel && details.bathrooms != null && { icon: Bath, label: "Bathrooms", value: details.bathrooms },
    details.size?.value > 0 && { icon: Maximize2, label: "Size", value: `${details.size.value} ${details.size.unit}` },
    { icon: Building2, label: "Type", value: formatType(details.type) },
  ].filter(Boolean);

  let panel;
  if (!user) panel = <SignInPrompt returnTo={location.pathname + location.search} />;
  else if (isOwnListing) panel = <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">This is your own listing.</p>;
  else if (wrongType)
    panel = (
      <div className="rounded-2xl bg-gray-50 p-5 text-sm text-gray-600">
        <p>This property is {isForSale ? "for sale" : "for rent"}.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={isForSale ? `/checkout/buy/${property.id}` : `/checkout/rent/${property.id}`} className="btn btn-primary">
            {isForSale ? "Request to buy" : "Rent Now"}
          </Link>
          <Link to={`/make-offer/${property.id}`} className="btn btn-light">Make Offer</Link>
        </div>
      </div>
    );
  else if (hotel && mode !== "rent") panel = <Link to={`/house/${property.id}#choose-room`} className="btn btn-primary">Choose a hotel room</Link>;
  else if (!available && !(hotel && new URLSearchParams(location.search).has("booking")))
    panel = (
      <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
        This property is {availability.toLowerCase()} and can't be {mode === "rent" ? "rented" : mode === "buy" ? "bought" : "offered on"} right now. You can still chat with {ownerName}.
      </p>
    );
  else if (mode === "rent") panel = hotel ? <HotelCheckout key={property.id + location.search} property={property} ownerName={ownerName} /> : <RentalCheckout property={property} ownerName={ownerName} />;
  else if (mode === "buy") panel = <BuyNowPanel property={property} ownerName={ownerName} whatsappLink={whatsappLink} onChat={property.agent.chat ? () => setChatOpen(true) : null} />;
  else panel = <OfferForm property={property} ownerName={ownerName} whatsappNumber={whatsappNumber} />;

  return (
    <div className="bg-gray-50 py-8 sm:py-12">
      <div className="container-page">
        <Link to={`/house/${property.id}`} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" />
          Back to property
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">{hotel ? "Book your hotel stay" : COPY[mode].title}</h1>
        <p className="mt-2 text-gray-600">{hotel ? "Choose your room, review what's included, and confirm your dates and guests before paying securely." : COPY[mode].intro}</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-5 lg:gap-8">
          {/* Property summary */}
          <section className="space-y-5 lg:col-span-2">
            <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-gray-200/80">
              <img src={media.images[0]} alt={title} className="aspect-16/10 w-full object-cover" />
              <div className="p-5">
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isForSale ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
                    {statusLabel(details.status)}
                  </span>
                  <StatusBadge status={availability} className="px-3 py-1" />
                </div>
                <h2 className="mt-3 text-xl font-bold text-gray-900">{title}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                  <MapPin className="h-4 w-4 text-brand-500" />
                  {[place.name, place.city].filter(Boolean).join(", ")}
                </p>
                <p className="mt-3 text-2xl font-extrabold tracking-tight text-brand-600">
                  {value}
                  {period && <span className="text-base font-medium text-gray-500">{period}</span>}
                </p>

                <h3 className="mt-5 text-xs font-bold tracking-wider text-gray-500 uppercase">Property Overview</h3>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  {specs.map((spec) => (
                    <div key={spec.label} className="flex items-center gap-2.5 rounded-2xl bg-gray-50 p-3">
                      <spec.icon className="h-4 w-4 shrink-0 text-brand-500" />
                      <div className="min-w-0">
                        <dd className="truncate text-sm font-bold text-gray-900 capitalize">{spec.value}</dd>
                        <dt className="text-xs text-gray-500">{spec.label}</dt>
                      </div>
                    </div>
                  ))}
                </dl>

                {features.length > 0 && (
                  <>
                    <h3 className="mt-5 text-xs font-bold tracking-wider text-gray-500 uppercase">{hotel ? "Hotel amenities" : "What This Property Offers"}</h3>
                    <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                      {features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-500" />
                          <span className="truncate">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>

            {/* Owner + questions before committing */}
            <div className="rounded-3xl bg-white p-5 ring-1 ring-gray-200/80">
              <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Listed by</p>
              <p className="mt-2 flex items-center gap-2 font-bold text-gray-900">
                {ownerName}
                {!isAdminListing && property.agent.verified && <BadgeCheck className="h-4 w-4 text-brand-500" />}
              </p>
              <p className="text-sm text-brand-700">{isAdminListing ? "Platform listing" : property.agent.verified ? "Approved Agent" : "Listing Agent"}</p>
              {user && !isOwnListing && (
                <>
                  <p className="mt-4 text-sm font-medium text-gray-700">Need more information?</p>
                  <div className={`mt-2 grid gap-2 ${whatsappLink && property.agent.chat ? "grid-cols-2" : ""}`}>
                    {property.agent.chat && <button onClick={() => setChatOpen(true)} className="btn btn-light px-3">
                      <MessageCircle className="h-4 w-4" />
                      Chat with {contactLabel}
                    </button>}
                    {whatsappLink && (
                      <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="btn bg-emerald-600 px-3 text-white hover:bg-emerald-700">
                        <WhatsAppIcon />
                        WhatsApp
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Rent / buy / offer flow */}
          <section className="lg:col-span-3">
            <div className="rounded-3xl bg-white p-6 ring-1 ring-gray-200/80 sm:p-8 lg:sticky lg:top-28">
              {!user && <h2 className="mb-4 text-center text-lg font-bold text-gray-900">Sign in required</h2>}
              {panel}
            </div>
          </section>
        </div>
      </div>

      {user && !isOwnListing && (
        <StartChatModal key={`chat-${property.id}`} property={property} ownerName={ownerName} open={chatOpen} onClose={() => setChatOpen(false)} />
      )}
    </div>
  );
};

export default PropertyAction;
