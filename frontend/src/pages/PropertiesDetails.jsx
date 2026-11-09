import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Bath,
  Bed,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  HandCoins,
  Heart,
  Home as HomeIcon,
  KeyRound,
  Mail,
  MapPin,
  Maximize2,
  MessageCircle,
  MessageSquare,
  Navigation,
  Phone,
  Share2,
  ShieldCheck,
  Star,
  Tag,
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
import { formatDate, formatRelative } from "../utils/date";
import { listedAgo } from "../utils/listedAgo";
import { amenityIcon } from "../utils/amenityIcons";
import { moveInCosts } from "../utils/moveIn";
import { propertyUrl } from "../utils/siteUrl";
import PageMetadata from "../components/brand/PageMetadata";
import {
  formatType,
  getInitials,
  getPriceParts,
  statusLabel,
} from "../utils/property";

// The map (and Leaflet) loads only when a listing has a location to show
const PropertyMap = lazy(() => import("../components/location/PropertyMap"));

// A section of the main column, with the mockup's heading style
const Section = ({ id, title, action, children, className = "" }) => (
  <section aria-labelledby={id} className={`py-7 ${className}`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 id={id} className="text-xl font-bold tracking-tight text-gray-900">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const PropertiesDetails = () => {
  const { id } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite, recordView } = useRealEstate();
  const { user } = useAuth();
  const { settings, siteName, paths } = usePlatform();
  // Which dialog is open: chat | inquiry. A guest who signed in to continue
  // comes back with ?action=... so the dialog they wanted opens straight away.
  const [dialog, setDialog] = useState(null);
  const [signInFor, setSignInFor] = useState(null);
  const [signInRating, setSignInRating] = useState(0); // the star a guest picked before being asked to sign in
  const [reviewSummary, setReviewSummary] = useState(null); // live from the reviews section
  const viewedRef = useRef(null);
  const [liveViews, setLiveViews] = useState(null); // { id, views } returned when this visit was recorded
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(""); // "link" | "reference" (briefly, after copying)

  // The property is always loaded from the API by its database id
  const detail = useApiQuery(`property:${id}:${user?.id || "guest"}`, () =>
    propertyApi.getPropertyById(id),
  );
  const property = detail.data;
  const agentOwnerId =
    user && property?.owner.type === "agent" ? property.ownerUserId : null;
  const related = useApiQuery(`related:${id}:${user?.id || "guest"}:4`, () =>
    propertyApi.getRelatedProperties(id, 4),
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

  // Record this visit once per page open (the ref guards re-renders and StrictMode; the backend's
  // dedupe is the real protection), then show the server's authoritative count. Never blocks the page.
  useEffect(() => {
    if (!property || viewedRef.current === id) return;
    viewedRef.current = id;
    recordView(id).then((result) => Number.isFinite(result?.views) && setLiveViews({ id, views: result.views }));
  }, [id, property, recordView]);

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
  const canExpandDescription = description.length > 280;
  const liked = isFavorite(id);
  const isForSale = details.status === "Sale";
  const hotel = isHotel(property);

  // Contact always goes to the real owner: the platform (admin listings) or the listing agent
  const isAdminListing = property.owner.type === "admin";
  const availability = property.listing.availability;
  const unavailable = availability === "Sold" || availability === "Rented";
  const ownerName = isAdminListing ? settings.general.siteName : agent.name;
  const ownerPhone = isAdminListing ? settings.contact.phone : agent.phone;
  const ownerEmail = isAdminListing ? settings.contact.email : agent.email;
  // Guests see an agent's name, phone and email after signing in (the platform's own listings show
  // them to everyone), but can always message the agent on WhatsApp from this page
  const showContacts = isAdminListing || Boolean(user);
  const whatsappNumber = ownerWhatsAppNumber(property, settings);
  const whatsappLink = buildWhatsAppLink(whatsappNumber, property, propertyUrl(id, settings));
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
  const areaLabel = [...new Set([place.name, place.city].filter(Boolean))].join(", ");
  const fullAddress = [...new Set([place.address, place.name, place.city, place.region, place.country].filter(Boolean))].join(", ");
  // Other listings around this one, on the listings map
  const nearbyLink = hasCoordinates
    ? `${paths.listings}?${new URLSearchParams({ near: `${Math.round(place.latitude * 1e5) / 1e5},${Math.round(place.longitude * 1e5) / 1e5}`, place: areaLabel || title, view: "map" })}`
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
  // In-app chat is a plan feature for agents; without it, customers contact them by inquiry
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
  const views = liveViews?.id === id ? liveViews.views : meta?.views || 0;
  const reference = id.slice(-8).toUpperCase();
  const listed = property.listing.createdAt ? listedAgo(property.listing.createdAt) : "";
  // Listing freshness: when the owner last confirmed it is still available (not repeated on the day it was listed)
  const confirmedAt = !hotel && property.listing.confirmedAt;
  const confirmedLater = confirmedAt && new Date(confirmedAt) - new Date(property.listing.createdAt) > 24 * 60 * 60 * 1000;
  const confirmedText = confirmedLater ? (() => { const when = formatRelative(confirmedAt); return /ago|Today|Yesterday/.test(when) ? when.toLowerCase() : `on ${when}`; })() : "";

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
    !hotel && details.bedrooms != null && { icon: Bed, label: "Bedrooms", value: details.bedrooms },
    !hotel && details.bathrooms != null && { icon: Bath, label: "Bathrooms", value: details.bathrooms },
    details.size?.value > 0 && { icon: Maximize2, label: `${details.size.unit}`, value: details.size.value },
    { icon: Building2, label: "Type", value: formatType(details.type) },
    { icon: Tag, label: "Listing", value: statusLabel(details.status) },
  ].filter(Boolean);

  // Monthly rentals: what it takes to move in (advance, agent fee, deposit), when the owner set it
  const moveIn = !hotel && !isForSale && property.pricing.perMonth != null ? moveInCosts(property.pricing.perMonth, property.moveIn) : null;
  const cedis = (amount) => `₵${Number(amount).toLocaleString()}`;

  // Only facts the listing actually has: nothing is filled in for display
  const detailRows = [
    ["Property type", formatType(details.type)],
    ["Listing", statusLabel(details.status)],
    !hotel && details.bedrooms != null && ["Bedrooms", details.bedrooms],
    ["Price", `${value}${period || ""}`],
    !hotel && details.bathrooms != null && ["Bathrooms", details.bathrooms],
    ["Availability", availability],
    details.size?.value > 0 && ["Size", `${details.size.value} ${details.size.unit}`],
    moveIn?.advanceMonths > 0 && ["Rent advance", `${moveIn.advanceMonths} ${moveIn.advanceMonths === 1 ? "month" : "months"}`],
    place.digitalAddress && ["Digital address", place.digitalAddress],
  ].filter(Boolean);

  const similar = related.data || []; // from GET /properties/:id/related

  const flash = (what) => {
    setCopied(what);
    setTimeout(() => setCopied((current) => (current === what ? "" : current)), 2000);
  };
  const handleShare = async () => {
    const url = propertyUrl(id, settings);
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        flash("link");
      }
    } catch {
      // The user closed the share sheet
    }
  };
  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      flash("reference");
    } catch {
      // Clipboard unavailable: the reference is still shown
    }
  };

  const helpText = hotel
    ? "Choose a room and your dates to check availability and review your stay total."
    : isForSale
      ? "This is the asking price. Discuss the final amount and arrange the sale directly with the agent or owner."
      : availability !== "Available"
        ? `This property is ${availability.toLowerCase()}. Contact the agent about other options.`
        : !canRent
          ? "Online rental payments are unavailable for this listing. Contact the agent to discuss your rental."
          : "Confirm availability with the agent, then review your rental dates and total before paying.";

  // Agents' published business contact details; account messaging requires sign-in.
  const whatsAppAction = (className, children) => (
    <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );

  return (
    <div className="bg-gray-50/60 pb-32 lg:pb-16">
      <PageMetadata title={`${title} | ${siteName}`} description={description.replace(/\s+/g, " ").slice(0, 160)} image={images[0]} />
      <div className="container-page pt-5 sm:pt-7">
        <nav aria-label="Breadcrumb" className="mb-5 flex min-w-0 items-center gap-1.5 text-xs text-gray-500 sm:text-sm">
          <Link to="/" className="inline-flex shrink-0 items-center gap-1 hover:text-brand-600">
            <HomeIcon aria-hidden="true" className="h-3.5 w-3.5" />
            Home
          </Link>
          <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0" />
          <Link to={paths.listings} className="shrink-0 text-brand-600 hover:text-brand-700">
            Properties
          </Link>
          <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0" />
          <span className="truncate text-gray-700">{title}</span>
        </nav>

        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full bg-brand-600 px-3 py-1 text-white">{statusLabel(details.status)}</span>
              <span className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-brand-700 capitalize">{formatType(details.type)}</span>
              {availability !== "Available" && <StatusBadge status={availability} />}
              {meta?.isFeatured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
                  <Star aria-hidden="true" className="h-3 w-3 fill-amber-400 text-amber-400" />
                  Featured
                </span>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-balance text-gray-900 sm:text-3xl lg:text-4xl">
              {title}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
                {areaLabel || "Location on request"}
              </span>
              {listed && (
                <>
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gray-300" />
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <CalendarDays aria-hidden="true" className="h-4 w-4" />
                    {listed}
                  </span>
                </>
              )}
              {confirmedText && (
                <>
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gray-300" />
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-emerald-700">
                    <BadgeCheck aria-hidden="true" className="h-4 w-4" />
                    Availability confirmed {confirmedText}
                  </span>
                </>
              )}
              {views > 0 && (
                <>
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gray-300" />
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <Eye aria-hidden="true" className="h-4 w-4" />
                    {views.toLocaleString()} {views === 1 ? "view" : "views"}
                  </span>
                </>
              )}
              {ratingCount > 0 && (
                <>
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gray-300" />
                  <a href="#reviews" className="flex items-center gap-1.5 hover:text-brand-700">
                    <Star aria-hidden="true" className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-medium text-gray-700">{ratingAverage.toFixed(1)}</span>
                    ({ratingCount})
                  </a>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={handleShare}
              aria-label={copied === "link" ? "Link copied" : "Share property"}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              {copied === "link" ? <Check aria-hidden="true" className="h-4 w-4 text-emerald-600" /> : <Share2 aria-hidden="true" className="h-4 w-4" />}
              {copied === "link" ? "Copied" : "Share"}
            </button>
            <button
              type="button"
              onClick={() => toggleFavorite(id)}
              aria-pressed={liked}
              aria-label={liked ? "Remove from saved" : "Save property"}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
            >
              <Heart aria-hidden="true" className={`h-4 w-4 ${liked ? "fill-brand-500 text-brand-500" : ""}`} />
              {liked ? "Saved" : "Save"}
            </button>
          </div>
        </header>

        {availability !== "Available" && (
          <p
            role="status"
            className={`mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm ${unavailable ? "border-gray-200 bg-white text-gray-700" : "border-amber-200 bg-amber-50 text-amber-900"}`}
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            {unavailable
              ? `This property has been ${availability.toLowerCase()} and is no longer available. Contact the owner about similar properties.`
              : "This property is under offer. You can still contact the owner to register your interest."}
          </p>
        )}

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-10">
          <div className="min-w-0">
            <PropertyGallery key={`gallery-${property.id}`} images={images} title={title} />

            <section aria-labelledby="property-specs-heading" className="mt-5 rounded-2xl border border-gray-200 bg-white px-2 py-3 shadow-sm shadow-gray-900/3">
              <h2 id="property-specs-heading" className="sr-only">Property at a glance</h2>
              <dl className="grid grid-cols-2 gap-y-3 sm:flex sm:divide-x sm:divide-gray-100">
                {specs.map((spec) => (
                  <div key={spec.label} className="flex min-w-0 flex-1 items-center justify-center gap-2.5 px-3 py-1">
                    <spec.icon aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-600" />
                    <div className="flex min-w-0 items-baseline gap-1.5 text-sm">
                      <dd className="font-semibold text-gray-900 capitalize">{spec.value}</dd>
                      <dt className="truncate text-gray-500">{spec.label}</dt>
                    </div>
                  </div>
                ))}
              </dl>
            </section>

            <Section id="property-description-heading" title="About this property">
              <p
                id="property-description"
                className={`text-sm leading-7 whitespace-pre-line text-gray-600 sm:text-base ${expanded || !canExpandDescription ? "" : "line-clamp-4"}`}
              >
                {description || "Contact the owner for more information about this property."}
              </p>
              {canExpandDescription && (
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => !prev)}
                  aria-expanded={expanded}
                  aria-controls="property-description"
                  className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  {expanded ? "Read less" : "Read more"}
                  <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </Section>

            {features?.length > 0 && (
              <Section id="property-amenities-heading" title={hotel ? "Hotel amenities" : "Amenities & Features"} className="border-t border-gray-200">
                <ul className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                  {features.map((feature) => {
                    const Icon = amenityIcon(feature);
                    return (
                      <li key={feature} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                          <Icon aria-hidden="true" className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 break-words">{feature}</span>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}

            <Section id="property-details-heading" title="Property Details" className="border-t border-gray-200">
              <dl className="grid rounded-2xl border border-gray-200 bg-white px-5 py-2 text-sm sm:grid-cols-2 sm:gap-x-10">
                {detailRows.map(([label, text]) => (
                  <div key={label} className="flex items-center justify-between gap-4 border-b border-gray-100 py-2.5 last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="text-right font-semibold text-gray-900">{text}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            {hotel && <HotelRooms key={`rooms-${property.id}`} property={property} canBook={!isOwnListing && availability === "Available"} />}

            <Section id="property-location-heading" title="Location" className="border-t border-gray-200">
              {hasCoordinates ? (
                <Suspense fallback={<div className="grid h-75 place-items-center rounded-2xl border border-gray-200 bg-white text-sm text-gray-500" role="status">Loading the map…</div>}>
                  <PropertyMap
                    latitude={place.latitude}
                    longitude={place.longitude}
                    title={property.title}
                    approximate={place.approximate}
                    action={mapLink && (
                      <a href={mapLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3.5 text-sm font-semibold text-gray-800 shadow-md hover:bg-gray-50">
                        Open in Maps
                        <ExternalLink aria-hidden="true" className="h-4 w-4" />
                      </a>
                    )}
                  />
                </Suspense>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="flex items-start gap-1.5 text-gray-600">
                  <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  {fullAddress || "Location on request"}
                </span>
                {nearbyLink && (
                  <>
                    <span aria-hidden="true" className="hidden h-4 w-px bg-gray-300 sm:block" />
                    <Link to={nearbyLink} className="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:text-brand-700">
                      <Navigation aria-hidden="true" className="h-4 w-4" />
                      See nearby places
                    </Link>
                  </>
                )}
                {!hasCoordinates && mapLink && (
                  <a href={mapLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:text-brand-700">
                    Open in Maps
                    <ExternalLink aria-hidden="true" className="h-4 w-4" />
                  </a>
                )}
              </div>
            </Section>

            <div className="border-t border-gray-200">
              <PropertyReviews
                key={`reviews-${property.id}`}
                propertyId={property.id}
                user={user}
                onRequireSignIn={requireSignInToReview}
                resumeRating={resumeRating}
                onResumeHandled={clearResume}
                onSummary={setReviewSummary}
              />
            </div>
          </div>

          <aside className="min-w-0 space-y-5 lg:sticky lg:top-24">
            <section
              id="property-contact"
              tabIndex={-1}
              aria-labelledby="property-contact-heading"
              className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm shadow-gray-900/5 xl:p-6"
            >
              <h2 id="property-contact-heading" className="text-sm text-gray-500">
                {hotel ? "Room rates from" : isForSale ? "Price" : "Rent"}
              </h2>
              <p className={`mt-1 text-3xl font-bold tracking-tight text-gray-900 ${unavailable ? "line-through opacity-60" : ""}`}>
                {value}
                {period && <span className="ml-1 text-base font-medium tracking-normal text-gray-500">{period}</span>}
              </p>
              {moveIn && (
                <div className="mt-4 rounded-xl bg-brand-50/60 p-4 text-sm ring-1 ring-brand-100">
                  <p className="font-semibold text-gray-900">To move in</p>
                  <dl className="mt-2 space-y-1.5 text-gray-600">
                    {moveIn.advanceMonths > 0 && <div className="flex justify-between gap-3"><dt>{moveIn.advanceMonths} {moveIn.advanceMonths === 1 ? "month" : "months"} of rent in advance</dt><dd className="font-medium text-gray-900">{cedis(moveIn.advance)}</dd></div>}
                    {moveIn.fee > 0 && <div className="flex justify-between gap-3"><dt>{moveIn.feeLabel}</dt><dd className="font-medium text-gray-900">{cedis(moveIn.fee)}</dd></div>}
                    {moveIn.deposit > 0 && <div className="flex justify-between gap-3"><dt>Security deposit</dt><dd className="font-medium text-gray-900">{cedis(moveIn.deposit)}</dd></div>}
                    <div className="flex justify-between gap-3 border-t border-brand-100 pt-2 text-base"><dt className="font-semibold text-gray-900">Total to move in</dt><dd className="font-bold text-gray-900">{cedis(moveIn.total)}</dd></div>
                  </dl>
                  <p className="mt-2 text-xs leading-5 text-gray-500">As stated by the owner. Confirm the amounts with them before paying.</p>
                </div>
              )}

              {isOwnListing ? (
                <p className="mt-5 rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-600">
                  This is your listing. Customer offers, rentals and messages appear in your dashboard.
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {!isForSale && (
                    <button type="button" onClick={startPrimary} disabled={!canPrimary} className={`${filledButton} w-full`}>
                      <KeyRound aria-hidden="true" className="h-4 w-4" />
                      {primaryLabel}
                    </button>
                  )}
                  {whatsappLink
                    ? whatsAppAction(`${isForSale ? filledButton : outlineButton} w-full`, <><WhatsAppIcon className="h-4 w-4" />Chat on WhatsApp</>)
                    : isForSale && (
                        <button type="button" onClick={startPrimary} disabled={!canPrimary} className={`${filledButton} w-full`}>
                          <MessageCircle aria-hidden="true" className="h-4 w-4" />
                          {primaryLabel}
                        </button>
                      )}
                  {showContacts && ownerPhone && (
                    <a href={`tel:${ownerPhone.replace(/\s+/g, "")}`} className={`${outlineButton} w-full`}>
                      <Phone aria-hidden="true" className="h-4 w-4" />
                      Call {isAdminListing ? siteName : "Agent"}
                    </a>
                  )}
                  <button type="button" onClick={() => requireAuth("inquiry")} className={`${outlineButton} w-full`}>
                    <CalendarDays aria-hidden="true" className="h-4 w-4" />
                    Request a Viewing
                  </button>
                  <div className="flex flex-wrap items-center justify-center gap-x-5 text-sm">
                    {chatAction === "chat" && (
                      <button type="button" onClick={() => requireAuth("chat")} className="inline-flex min-h-10 items-center gap-1.5 font-medium text-gray-600 hover:text-brand-700">
                        <MessageSquare aria-hidden="true" className="h-4 w-4" />
                        Chat with {contactLabel}
                      </button>
                    )}
                    {!hotel && (
                      <button type="button" onClick={() => startFlow("offer")} disabled={!canMakeOffer} className="inline-flex min-h-10 items-center gap-1.5 font-medium text-gray-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
                        <HandCoins aria-hidden="true" className="h-4 w-4" />
                        Make an offer
                      </button>
                    )}
                  </div>
                  <p className="text-xs leading-5 text-gray-500">{helpText}</p>
                </div>
              )}

              <div className="mt-5 border-t border-gray-100 pt-5">
                {showContacts ? (
                  <>
                    <p className="text-xs text-gray-500">Listed by</p>
                    <div className="mt-2 flex items-center gap-3">
                      {agent.profileImage && !isAdminListing ? (
                        <img src={agent.profileImage} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                          {getInitials(ownerName)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 text-sm font-bold break-words text-gray-900">
                          {ownerName}
                          {(isAdminListing || agent.verified) && <BadgeCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-600" />}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {isAdminListing ? `${siteName} team` : agent.verified ? "Approved agent" : "Listing agent"}
                          {!isAdminListing && (agent.agency?.name || agent.companyName) ? ` · ${agent.agency?.name || agent.companyName}` : ""}
                        </p>
                        {!isAdminListing && listingCount != null && (
                          <p className="mt-0.5 text-xs text-gray-500">{listingCount} {listingCount === 1 ? "listing" : "listings"} on {siteName}</p>
                        )}
                      </div>
                    </div>
                    {emailLink && (
                      <a href={emailLink} className="mt-3 flex min-h-10 items-center gap-2 text-sm break-all text-gray-600 hover:text-brand-700">
                        <Mail aria-hidden="true" className="h-4 w-4 shrink-0" />
                        {ownerEmail}
                      </a>
                    )}
                    {!isAdminListing && (
                      <Link to={`/agents/${agent.id}`} className={`${outlineButton} mt-3 w-full`}>
                        View Agent Profile
                      </Link>
                    )}
                  </>
                ) : (
                  <SignInPrompt returnTo={location.pathname + location.search} message="Sign in or create an account to view this agent's profile and contact details." />
                )}
              </div>

              <dl className="mt-5 space-y-3 border-t border-gray-100 pt-5 text-sm">
                <div>
                  <dt className="text-xs text-gray-500">Property reference</dt>
                  <dd className="mt-1 flex items-center justify-between gap-3 font-semibold text-gray-900">
                    <span className="tabular-nums">{reference}</span>
                    <button type="button" onClick={copyReference} aria-label={copied === "reference" ? "Reference copied" : "Copy property reference"} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800">
                      {copied === "reference" ? <Check aria-hidden="true" className="h-4 w-4 text-emerald-600" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
                    </button>
                  </dd>
                </div>
                {[
                  [Building2, "Property type", formatType(details.type)],
                  [Tag, "Status", statusLabel(details.status)],
                  property.listing.createdAt && [CalendarDays, "Listed on", formatDate(property.listing.createdAt)],
                  [Eye, "Views", views.toLocaleString()],
                ].filter(Boolean).map(([Icon, label, text]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-gray-500"><Icon aria-hidden="true" className="h-4 w-4" />{label}</dt>
                    <dd className="font-semibold text-gray-900 capitalize">{text}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-5 flex items-start gap-2 border-t border-gray-100 pt-4 text-xs leading-5 text-gray-500">
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {isForSale ? "View the property before making any payment." : `Rental payments are verified by ${siteName}.`}
              </p>
            </section>
          </aside>
        </div>

        {similar.length > 0 && (
          <section className="mt-10 border-t border-gray-200 pt-8 sm:mt-12" aria-labelledby="similar-properties-heading">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <h2 id="similar-properties-heading" className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">Similar properties</h2>
              <Link to={`${paths.listings}?status=${details.status}`} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
                View all
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {similar.map((item, index) => (
                <Reveal key={item.id} delay={index * 0.06} className="h-full">
                  <HouseCard house={item} />
                </Reveal>
              ))}
            </div>
          </section>
        )}

        {!isOwnListing && !unavailable && (
          <section aria-labelledby="property-cta-heading" className="mt-10 flex flex-col gap-5 rounded-3xl bg-linear-to-r from-brand-700 to-brand-500 p-6 text-white shadow-lg shadow-brand-900/20 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15">
                <HomeIcon aria-hidden="true" className="h-7 w-7" />
              </span>
              <div>
                <h2 id="property-cta-heading" className="text-lg font-bold">Like this property?</h2>
                <p className="mt-0.5 text-sm text-white/85">
                  {hotel ? "Choose your room and dates to see your stay total." : `Contact ${isAdminListing ? siteName : "the agent"} today to ask questions or schedule a viewing.`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {hotel ? (
                <button type="button" onClick={startPrimary} disabled={!canPrimary} className={ctaPrimary}>
                  <KeyRound aria-hidden="true" className="h-4 w-4" />
                  Choose your room
                </button>
              ) : whatsappLink ? (
                whatsAppAction(ctaPrimary, <><WhatsAppIcon className="h-4 w-4" />Chat on WhatsApp</>)
              ) : (
                <button type="button" onClick={startPrimary} disabled={!canPrimary} className={ctaPrimary}>
                  <MessageCircle aria-hidden="true" className="h-4 w-4" />
                  {primaryLabel}
                </button>
              )}
              <button type="button" onClick={() => requireAuth("inquiry")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/60 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10">
                <CalendarDays aria-hidden="true" className="h-4 w-4" />
                Request a Viewing
              </button>
            </div>
          </section>
        )}
      </div>
      <InquiryModal key={property.id} property={property} open={activeDialog === "inquiry"} onClose={closeDialog} />
      <StartChatModal key={`chat-${property.id}`} property={property} ownerName={ownerName} open={activeDialog === "chat"} onClose={closeDialog} />
      <SignInRequiredModal
        open={Boolean(signInFor)}
        onClose={() => setSignInFor(null)}
        message={signInFor === "review" ? "Please sign in to rate or review this property." : undefined}
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
            <p className={`text-lg font-bold tracking-tight text-gray-900 ${unavailable ? "line-through opacity-60" : ""}`}>
              {value}
              {period && <span className="ml-1 text-xs font-normal tracking-normal text-gray-500">{period}</span>}
            </p>
            <span className="text-xs text-gray-500">{statusLabel(details.status)}</span>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={startPrimary} disabled={!canPrimary} className={`${filledButton} min-w-0 flex-1 px-3`}>
              {primaryLabel}
            </button>
            <a href="#property-contact" className={`${outlineButton} shrink-0 px-4`}>
              <MessageCircle aria-hidden="true" className="h-4 w-4" />
              Contact
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

const filledButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none";
const outlineButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand-300 bg-white px-4 py-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50";
const ctaPrimary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60";

export default PropertiesDetails;
