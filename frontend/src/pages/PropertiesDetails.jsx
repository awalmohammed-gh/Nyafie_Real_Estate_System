import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Bath,
  Bed,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  HandCoins,
  KeyRound,
  Heart,
  Mail,
  MessageSquare,
  MessageCircle,
  AlertCircle,
  BadgeCheck,
  MapPin,
  Maximize2,
  Phone,
  Share2,
  ShieldCheck,
  Star,
} from "lucide-react";
import { useRealEstate } from "../context/useRealEstate";
import HouseCard from "../components/card/HouseCard";
import Reveal from "../components/ui/Reveal";
import NotFound from "./NotFound";
import { propertyApi } from "../frontApi";
import { useApiQuery } from "../hooks/useApiQuery";
import PageLoader from "../components/ui/PageLoader";
import InquiryModal from "../components/InquiryModal";
import { useAuth } from "../context/useAuth";
import { usePlatform } from "../context/usePlatform";
import StartChatModal from "../components/chat/StartChatModal";
import WhatsAppIcon from "../components/ui/WhatsAppIcon";
import StatusBadge from "../components/ui/StatusBadge";
import SignInRequiredModal, { SignInPrompt } from "../components/property/SignInRequiredModal";
import PropertyGallery from "../components/property/PropertyGallery";
import PropertyReviews from "../components/reviews/PropertyReviews";
import HotelRooms from "../components/property/HotelRooms";
import { isHotel } from "../utils/hotel";
import {
  buildPropertyEmailLink,
  buildWhatsAppLink,
  ownerWhatsAppNumber,
} from "../utils/whatsapp";
import { formatDate } from "../utils/date";
import { propertyUrl } from "../utils/siteUrl";
import PageMetadata from "../components/brand/PageMetadata";
import {
  formatType,
  getInitials,
  getPriceParts,
  statusLabel,
} from "../utils/property";

const PropertiesDetails = () => {
  const { id } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite, recordView } = useRealEstate();
  const { user } = useAuth();
  const { settings, siteName } = usePlatform();
  // Which dialog is open: chat | inquiry. A guest who signed in to continue
  // comes back with ?action=... so the dialog they wanted opens straight away.
  const [dialog, setDialog] = useState(null);
  const [signInFor, setSignInFor] = useState(null);
  const [signInRating, setSignInRating] = useState(0); // the star a guest picked before being asked to sign in
  const [reviewSummary, setReviewSummary] = useState(null); // live from the reviews section
  const viewedRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // The property is always loaded from the API by its database id
  const detail = useApiQuery(`property:${id}:${user?.id || "guest"}`, () =>
    propertyApi.getPropertyById(id),
  );
  const property = detail.data;
  const agentOwnerId =
    user && property?.owner.type === "agent" ? property.ownerUserId : null;
  const related = useApiQuery(`related:${id}:${user?.id || "guest"}`, () =>
    propertyApi.getRelatedProperties(id, 3),
  );
  // How many public listings the agent has (counted on the server)
  const agentListings = useApiQuery(`agent-count:${agentOwnerId}`, () =>
    agentOwnerId
      ? propertyApi.searchProperties({
          owner: agentOwnerId,
          availability: ["Available", "Under Offer"],
          limit: 1,
        })
      : Promise.resolve(null),
  );

  // Count one view per visit for agent listings (not the owner viewing their own listing)
  useEffect(() => {
    if (!property || viewedRef.current === id) return;
    viewedRef.current = id;
    if (property.owner?.type === "agent" && property.owner.id !== user?.id)
      recordView(id);
  }, [id, property, user, recordView]);

  if (detail.loading) return <PageLoader label="Loading property..." />;
  if (detail.error) {
    // 404: missing, unpublished or hidden. Anything else: the request failed, so offer a retry.
    if (/not found/i.test(detail.error))
      return (
        <NotFound message="Property not found. It may have been removed or is no longer listed." />
      );
    return (
      <div className="container-page grid min-h-[60vh] place-items-center py-16">
        <div role="alert" className="max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900">
            Unable to load this property
          </h1>
          <p className="mt-2 text-gray-600">{detail.error}</p>
          <button onClick={detail.reload} className="btn btn-primary mt-6">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const {
    title,
    description,
    location: place,
    property: details,
    features,
    media,
    agent,
    meta,
  } = property;
  const { value, period } = getPriceParts(property);
  const images = media.images;
  const canExpandDescription = description.length > 180;
  const liked = isFavorite(id);
  const isForSale = details.status === "Sale";
  const hotel = isHotel(property);

  // Contact always goes to the real owner: HomeBase (admin listings) or the listing agent
  const isAdminListing = property.owner.type === "admin";
  const availability = property.listing.availability;
  const unavailable = availability === "Sold" || availability === "Rented";
  const ownerName = isAdminListing ? settings.general.siteName : agent.name;
  const ownerPhone = isAdminListing ? settings.contact.phone : agent.phone;
  const ownerEmail = isAdminListing ? settings.contact.email : agent.email;
  const whatsappNumber = ownerWhatsAppNumber(property, settings);
  const whatsappLink = buildWhatsAppLink(
    whatsappNumber,
    property,
    propertyUrl(id, settings),
  );
  const listingCount = agentListings.data?.total;
  const emailLink = buildPropertyEmailLink(
    ownerEmail,
    property,
    propertyUrl(id, settings),
  );
  const hasCoordinates =
    Number.isFinite(place.latitude) && Number.isFinite(place.longitude);
  const mapQuery = hasCoordinates
    ? `${place.latitude},${place.longitude}`
    : [place.address, place.name, place.city, place.region, place.country]
        .filter(Boolean)
        .join(", ");
  const mapLink = mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : null;
  const isOwnListing =
    Boolean(user) &&
    ((isAdminListing && user.role === "admin") ||
      property.ownerUserId === user.id);
  // Rentals need an available property; purchase requests and offers follow the existing sale rules.
  const canRent =
    availability === "Available" &&
    settings.payments.rentalsAvailable &&
    property.pricing.currency === "GHS";
  const canPrimary = hotel ? availability === "Available" && property.roomTypes.some((room) => room.active) : isForSale || canRent;
  const canMakeOffer = !hotel && !unavailable;
  const primaryLabel = hotel ? "Choose your room" : isForSale
    ? isAdminListing
      ? "Contact owner"
      : "Contact Agent"
    : "Proceed with rental";
  const flowPaths = {
    buy: `/checkout/buy/${id}`,
    rent: `/checkout/rent/${id}`,
    offer: `/make-offer/${id}`,
  };
  const contactLabel = isAdminListing ? siteName : "Agent";
  // HomeBase chat is a plan feature for agents; without it, customers contact them by inquiry
  // (guests don't see agent details yet, so they are asked to sign in first and routed after)
  const chatAction = user && !property.agent.chat ? "inquiry" : "chat";

  // The dialog opened by a click, or the one a returning guest asked for
  const resumeAction =
    user && !isOwnListing ? searchParams.get("action") : null;
  const activeDialog =
    dialog ??
    (["chat", "inquiry"].includes(resumeAction) ? (resumeAction === "chat" ? chatAction : resumeAction) : null);

  // A guest who picked a star comes back from sign-in with ?action=review&rating=N
  const resumeRating =
    user && searchParams.get("action") === "review"
      ? Math.min(
          5,
          Math.max(0, Math.round(Number(searchParams.get("rating")) || 0)),
        )
      : null;
  const clearResume = () => setSearchParams({}, { replace: true });
  const requireSignInToReview = (rating = 0) => {
    setSignInRating(rating);
    setSignInFor("review");
  };
  const reviewReturnTo = `${location.pathname}?action=review${signInRating ? `&rating=${signInRating}` : ""}#reviews`;
  // Header rating: the reviews section's latest numbers once loaded, otherwise the stored ones
  const ratingCount = reviewSummary
    ? reviewSummary.count
    : meta?.ratingCount || 0;
  const ratingAverage = reviewSummary ? reviewSummary.average : meta?.rating;

  const closeDialog = () => {
    setDialog(null);
    if (searchParams.has("action")) setSearchParams({}, { replace: true });
  };

  // Guests can browse freely, but must sign in before offering, renting or contacting the owner
  const requireAuth = (action) => {
    if (user) return setDialog(action);
    setSignInFor(action);
  };

  // Rentals, purchase requests and offers continue on their own pages, which reload the property from the backend
  const startFlow = (flow) => {
    if (user) navigate(flowPaths[flow]);
    else setSignInFor(flow);
  };
  const startPrimary = () => {
    if (hotel) return document.getElementById("choose-room")?.scrollIntoView({ behavior: "smooth", block: "start" });
    isForSale ? requireAuth(chatAction) : startFlow("rent");
  };

  const specs = [
    !hotel && details.bedrooms != null && {
      icon: Bed,
      label: "Bedrooms",
      value: details.bedrooms,
    },
    !hotel && details.bathrooms != null && {
      icon: Bath,
      label: "Bathrooms",
      value: details.bathrooms,
    },
    details.size?.value > 0 && {
      icon: Maximize2,
      label: "Size",
      value: `${details.size.value} ${details.size.unit}`,
    },
    { icon: Building2, label: "Type", value: formatType(details.type) },
  ].filter(Boolean);

  const similar = related.data || []; // from GET /properties/:id/related

  const handleShare = async () => {
    const url = propertyUrl(id, settings);
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // The user closed the share sheet
    }
  };

  // Agents' published business contact details are public; account messaging requires sign-in.
  const whatsAppAction = (className, children) => (
    <a
      href={whatsappLink}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );

  return (
    <div className="bg-white pb-32 lg:pb-16">
      <PageMetadata title={`${title} | ${siteName}`} description={description.replace(/\s+/g, " ").slice(0, 160)} image={images[0]} />
      <div className="container-page pt-5 sm:pt-7">
        <nav
          aria-label="Breadcrumb"
          className="mb-5 flex min-w-0 items-center gap-2 text-xs text-gray-500 sm:text-sm"
        >
          <Link to="/" className="shrink-0 hover:text-brand-600">
            Home
          </Link>
          <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0" />
          <Link
            to={isForSale ? "/sale" : "/rent"}
            className="shrink-0 hover:text-brand-600"
          >
            {statusLabel(details.status)}
          </Link>
          <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0" />
          <span className="truncate text-gray-700">{title}</span>
        </nav>

        <header className="mb-7 flex flex-col gap-5 border-b border-gray-100 pb-6 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium sm:text-sm">
              <span className="font-semibold text-brand-600">
                {statusLabel(details.status)}
              </span>
              <span
                aria-hidden="true"
                className="h-1 w-1 rounded-full bg-gray-300"
              />
              <span className="text-gray-500">{formatType(details.type)}</span>
              <StatusBadge status={availability} />
              {meta?.isFeatured && (
                <span className="inline-flex items-center gap-1 text-gray-500">
                  <Star aria-hidden="true" className="h-3.5 w-3.5" />
                  Featured
                </span>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-balance text-gray-900 sm:text-3xl lg:text-4xl">
              {title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
                {[...new Set([place.name, place.city].filter(Boolean))].join(
                  ", ",
                ) || "Location on request"}
              </span>
              {ratingCount > 0 && (
                <a
                  href="#reviews"
                  className="flex items-center gap-1.5 hover:text-brand-700"
                >
                  <Star
                    aria-hidden="true"
                    className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                  />
                  <span className="font-medium text-gray-700">
                    {ratingAverage.toFixed(1)}
                  </span>
                  ({ratingCount} {ratingCount === 1 ? "rating" : "ratings"})
                </a>
              )}
              {Boolean(meta?.views) && (
                <span className="flex items-center gap-1.5">
                  <Eye aria-hidden="true" className="h-4 w-4" />
                  {meta.views.toLocaleString()} views
                </span>
              )}
            </div>
          </div>
          <div className="flex items-end justify-between gap-6 lg:shrink-0 lg:flex-col lg:items-end lg:gap-4">
            <div>
              <p className="text-xs text-gray-500 lg:text-right">
                {hotel ? "Room rates" : isForSale ? "Asking price" : "Rent"}
              </p>
              <p
                className={`mt-1 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl ${unavailable ? "line-through opacity-60" : ""}`}
              >
                {value}
                {period && (
                  <span className="ml-1 text-sm font-normal tracking-normal text-gray-500">
                    {period}
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toggleFavorite(id)}
                aria-pressed={liked}
                aria-label={liked ? "Remove from saved" : "Save property"}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              >
                <Heart
                  aria-hidden="true"
                  className={`h-4 w-4 ${liked ? "fill-brand-500 text-brand-500" : ""}`}
                />
                <span className="hidden sm:inline">
                  {liked ? "Saved" : "Save"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleShare}
                aria-label={copied ? "Link copied" : "Share property"}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 transition-colors hover:bg-gray-50"
              >
                {copied ? (
                  <Check
                    aria-hidden="true"
                    className="h-4 w-4 text-emerald-600"
                  />
                ) : (
                  <Share2 aria-hidden="true" className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {copied ? "Copied" : "Share"}
                </span>
              </button>
            </div>
          </div>
        </header>

        {availability !== "Available" && (
          <p
            role="status"
            className={`mb-6 flex items-start gap-3 rounded-lg border p-4 text-sm ${unavailable ? "border-gray-200 bg-gray-50 text-gray-700" : "border-amber-200 bg-amber-50 text-amber-900"}`}
          >
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            {unavailable
              ? `This property has been ${availability.toLowerCase()} and is no longer available. Contact the owner about similar properties.`
              : "This property is under offer. You can still contact the owner to register your interest."}
          </p>
        )}

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-10">
          <div className="min-w-0">
            <PropertyGallery key={property.id} images={images} title={title} />
            <section
              aria-labelledby="property-specs-heading"
              className="mt-6 border-y border-gray-200 py-5"
            >
              <h2 id="property-specs-heading" className="sr-only">
                Property at a glance
              </h2>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
                {specs.map((spec) => (
                  <div
                    key={spec.label}
                    className="flex min-w-0 items-start gap-3"
                  >
                    <spec.icon
                      aria-hidden="true"
                      className="mt-1 h-5 w-5 shrink-0 text-gray-400"
                    />
                    <div className="min-w-0">
                      <dt className="text-xs text-gray-500">{spec.label}</dt>
                      <dd className="mt-1 text-sm font-semibold leading-relaxed break-words text-gray-900 sm:text-base">
                        {spec.value}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
            </section>

            <section
              className="border-b border-gray-200 py-7 sm:py-8"
              aria-labelledby="property-description-heading"
            >
              <h2
                id="property-description-heading"
                className="text-lg font-semibold tracking-tight text-gray-900 sm:text-xl"
              >
                About this property
              </h2>
              <p
                id="property-description"
                className={`mt-4 text-sm leading-7 whitespace-pre-line text-gray-600 sm:text-base ${expanded || !canExpandDescription ? "" : "line-clamp-5"}`}
              >
                {description ||
                  "Contact the owner for more information about this property."}
              </p>
              {canExpandDescription && (
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => !prev)}
                  aria-expanded={expanded}
                  aria-controls="property-description"
                  className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  {expanded ? "Read less" : "Read full description"}
                  <ChevronRight
                    aria-hidden="true"
                    className={`h-4 w-4 transition-transform ${expanded ? "-rotate-90" : "rotate-90"}`}
                  />
                </button>
              )}
            </section>

            {features?.length > 0 && (
              <section
                className="border-b border-gray-200 py-7 sm:py-8"
                aria-labelledby="property-amenities-heading"
              >
                <h2
                  id="property-amenities-heading"
                  className="text-lg font-semibold tracking-tight text-gray-900 sm:text-xl"
                >
                  {hotel ? "Hotel amenities" : "Amenities & features"}
                </h2>
                <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                  {features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-3 text-sm text-gray-700"
                    >
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section
              className="border-b border-gray-200 py-7 sm:py-8"
              aria-labelledby="property-location-heading"
            >
              <h2
                id="property-location-heading"
                className="text-lg font-semibold tracking-tight text-gray-900 sm:text-xl"
              >
                The neighbourhood
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                Explore the location and arrange a viewing with the listing
                agent.
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 text-sm sm:grid-cols-4">
                {[
                  ["Area", place.name],
                  ["City", place.city],
                  ["Region", place.region],
                  ["Country", place.country],
                  ["Address", place.address],
                  ["Digital address", place.digitalAddress],
                ].map(([label, text]) => (
                  <div key={label}>
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="mt-1 font-medium text-gray-900">
                      {text || "Not provided"}
                    </dd>
                  </div>
                ))}
              </dl>
              {mapLink && (
                <a
                  href={mapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-600"
                >
                  <MapPin className="h-4 w-4" />
                  {hasCoordinates
                    ? "View property on map"
                    : "Explore location on map"}
                </a>
              )}
            </section>
            <section
              className="py-7 sm:py-8"
              aria-labelledby="property-listing-heading"
            >
              <h2
                id="property-listing-heading"
                className="text-lg font-semibold tracking-tight text-gray-900 sm:text-xl"
              >
                Listing details
              </h2>
              <dl className="mt-5 grid grid-cols-2 gap-6 text-sm">
                <div>
                  <dt className="text-xs text-gray-500">Listed on</dt>
                  <dd className="mt-1 font-medium text-gray-900">
                    {property.listing.createdAt
                      ? formatDate(property.listing.createdAt)
                      : "Not provided"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Property reference</dt>
                  <dd className="mt-1 font-medium text-gray-900">
                    {id.slice(-8).toUpperCase()}
                  </dd>
                </div>
              </dl>
            </section>

            <PropertyReviews
              key={property.id}
              propertyId={property.id}
              user={user}
              onRequireSignIn={requireSignInToReview}
              resumeRating={resumeRating}
              onResumeHandled={clearResume}
              onSummary={setReviewSummary}
            />
            {hotel && <HotelRooms key={property.id} property={property} canBook={!isOwnListing && availability === "Available"} />}
          </div>

          <aside className="min-w-0 lg:sticky lg:top-24">
            <section
              id="property-contact"
              tabIndex={-1}
              aria-labelledby="property-contact-heading"
              className="scroll-mt-24 rounded-xl border border-gray-200 bg-white p-5 shadow-sm shadow-gray-900/3 xl:p-6"
            >
              <h2
                id="property-contact-heading"
                className="text-lg font-semibold tracking-tight text-gray-900"
              >
                Your next steps
              </h2>
              {isOwnListing ? (
                <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm leading-relaxed text-gray-600">
                  This is your listing. Customer offers, rentals and messages
                  appear in your dashboard.
                </p>
              ) : (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={startPrimary}
                    disabled={!canPrimary}
                    className={`${primaryActionClass} w-full`}
                  >
                    {isForSale ? (
                      <MessageCircle aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <KeyRound aria-hidden="true" className="h-4 w-4" />
                    )}
                    {primaryLabel}
                  </button>
                  <p className="mt-3 text-xs leading-5 text-gray-500">
                    {hotel ? "Choose a room and your dates to check availability and review your stay total." : isForSale
                      ? "This is the asking price. Discuss the final amount and arrange the sale directly with the agent or owner."
                      : availability !== "Available"
                        ? `This property is ${availability.toLowerCase()}. Contact the agent about other options.`
                        : !canRent
                          ? "Online rental payments are unavailable for this listing. Contact the agent to discuss your rental."
                          : "Confirm availability with the agent, then review your rental dates and total before paying online."}
                  </p>
                  {!hotel && <button
                    type="button"
                    onClick={() => startFlow("offer")}
                    disabled={!canMakeOffer}
                    className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-4 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <HandCoins aria-hidden="true" className="h-4 w-4" />
                    Make an offer
                  </button>}
                </div>
              )}
              {isAdminListing || user ? <div className="mt-5 border-t border-gray-100 pt-5">
                <p className="text-xs text-gray-500">Listed by</p>
                <div className="mt-3 flex items-center gap-3">
                  {agent.profileImage && !isAdminListing ? (
                    <img
                      src={agent.profileImage}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                      {getInitials(ownerName)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-gray-900">
                      {isAdminListing ? (
                        ownerName
                      ) : (
                        <Link
                          to={`/agents/${agent.profileId}`}
                          className="hover:text-brand-600"
                        >
                          {ownerName}
                        </Link>
                      )}
                    </p>
                    {(agent.agency?.name || agent.companyName) && !isAdminListing && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {agent.agency?.name || agent.companyName}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-500">
                      {isAdminListing
                        ? `${siteName} team`
                        : listingCount != null
                          ? `${listingCount} ${listingCount === 1 ? "listing" : "listings"} on ${siteName}`
                          : "Independent listing agent"}
                    </p>
                  </div>
                </div>
                {!isAdminListing && agent.verified && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-brand-700">
                    <BadgeCheck className="h-4 w-4" />
                    Approved agent
                  </p>
                )}
                {!isOwnListing && (
                  <>
                    <button
                      type="button"
                      onClick={() => requireAuth(chatAction)}
                      className={`${secondaryActionClass} mt-5 w-full`}
                    >
                      {chatAction === "chat" ? <MessageCircle aria-hidden="true" className="h-4 w-4" /> : <MessageSquare aria-hidden="true" className="h-4 w-4" />}
                      {chatAction === "chat" ? `Chat with ${contactLabel}` : "Send an inquiry"}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-x-5 text-xs">
                      {whatsappLink &&
                        whatsAppAction(
                          "inline-flex min-h-11 items-center gap-1.5 font-medium text-gray-600 hover:text-brand-700",
                          <>
                            <WhatsAppIcon className="h-3.5 w-3.5" />
                            WhatsApp
                          </>,
                        )}
                      {chatAction === "chat" && <button
                        type="button"
                        onClick={() => requireAuth("inquiry")}
                        className="inline-flex min-h-11 items-center gap-1.5 font-medium text-gray-600 hover:text-brand-700"
                      >
                        <MessageSquare
                          aria-hidden="true"
                          className="h-3.5 w-3.5"
                        />
                        Send inquiry / arrange viewing
                      </button>}
                    </div>
                  </>
                )}
                {(ownerPhone || ownerEmail) && (
                  <div className="mt-3 space-y-1 text-sm">
                    {ownerPhone && (
                      <a
                        href={`tel:${ownerPhone.replace(/\s+/g, "")}`}
                        className="flex min-h-11 items-center gap-2 text-gray-600 hover:text-brand-700"
                      >
                        <Phone
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0"
                        />
                        {ownerPhone}
                      </a>
                    )}
                    {emailLink && (
                      <a
                        href={emailLink}
                        className="flex min-h-11 items-center gap-2 break-all text-gray-600 hover:text-brand-700"
                      >
                        <Mail aria-hidden="true" className="h-4 w-4 shrink-0" />
                        {ownerEmail}
                      </a>
                    )}
                  </div>
                )}
                {!isAdminListing && (
                  <Link
                    to={`/agents/${agent.id}`}
                    className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    View agent profile & listings
                    <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div> : <div className="mt-5 border-t border-gray-100 pt-5"><SignInPrompt returnTo={location.pathname + location.search} message="Sign in or create an account to view this agent's profile and contact details." /></div>}
              <p className="mt-4 flex items-start gap-2 border-t border-gray-100 pt-4 text-xs leading-5 text-gray-500">
                <ShieldCheck
                  aria-hidden="true"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                {isForSale
                  ? "View the property before making any payment."
                  : `Rental payments are verified by ${siteName}.`}
              </p>
            </section>
          </aside>
        </div>

        {similar.length > 0 && (
          <section
            className="mt-12 border-t border-gray-200 pt-8 sm:mt-16 sm:pt-10"
            aria-labelledby="similar-properties-heading"
          >
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500">
                  Keep exploring
                </p>
                <h2
                  id="similar-properties-heading"
                  className="mt-1 text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl"
                >
                  Similar properties
                </h2>
              </div>
              <Link
                to={isForSale ? "/sale" : "/rent"}
                className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View all
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((item, index) => (
                <Reveal key={item.id} delay={index * 0.06} className="h-full">
                  <HouseCard house={item} />
                </Reveal>
              ))}
            </div>
          </section>
        )}
      </div>
      <InquiryModal
        key={property.id}
        property={property}
        open={activeDialog === "inquiry"}
        onClose={closeDialog}
      />
      <StartChatModal
        key={`chat-${property.id}`}
        property={property}
        ownerName={ownerName}
        open={activeDialog === "chat"}
        onClose={closeDialog}
      />
      <SignInRequiredModal
        open={Boolean(signInFor)}
        onClose={() => setSignInFor(null)}
        message={
          signInFor === "review"
            ? "Please sign in to rate or review this property."
            : undefined
        }
        returnTo={
          signInFor === "review"
            ? reviewReturnTo
            : flowPaths[signInFor]
              ? flowPaths[signInFor]
              : ["chat", "inquiry"].includes(signInFor)
                ? `${location.pathname}?action=${signInFor}`
                : location.pathname
        }
      />
      {!isOwnListing && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p
              className={`text-lg font-semibold tracking-tight text-gray-900 ${unavailable ? "line-through opacity-60" : ""}`}
            >
              {value}
              {period && (
                <span className="ml-1 text-xs font-normal tracking-normal text-gray-500">
                  {period}
                </span>
              )}
            </p>
            <span className="text-xs text-gray-500">
              {statusLabel(details.status)}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={startPrimary}
              disabled={!canPrimary}
              className={`${primaryActionClass} min-w-0 flex-1 px-3 text-sm`}
            >
              {primaryLabel}
            </button>
            <a
              href="#property-contact"
              className={`${secondaryActionClass} shrink-0 px-4 text-sm`}
            >
              <MessageCircle aria-hidden="true" className="h-4 w-4" />
              Contact
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
const primaryActionClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400";
const secondaryActionClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700";
export default PropertiesDetails;
