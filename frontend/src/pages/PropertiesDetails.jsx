import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Bath,
  Bed,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  HandCoins,
  KeyRound,
  ShoppingBag,
  Heart,
  Images,
  Lock,
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
  X,
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
import SignInRequiredModal from "../components/property/SignInRequiredModal";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { buildWhatsAppLink, ownerWhatsAppNumber } from "../utils/whatsapp";
import { formatDate } from "../utils/date";
import { formatType, getInitials, getPriceParts, statusLabel } from "../utils/property";

const COUNTRY = "Ghana"; // every HomeBase listing is in Ghana (prices in GHS, +233 numbers)

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
  const viewedRef = useRef(null);
  const [activeImage, setActiveImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // The property is always loaded from the API by its database id
  const detail = useApiQuery(`property:${id}`, () => propertyApi.getPropertyById(id));
  const property = detail.data;
  const agentOwnerId = property?.owner.type === "agent" ? property.ownerUserId : null;
  const related = useApiQuery(`related:${id}`, () => propertyApi.getRelatedProperties(id, 3));
  // How many public listings the agent has (counted on the server)
  const agentListings = useApiQuery(`agent-count:${agentOwnerId}`, () => (agentOwnerId ? propertyApi.searchProperties({ owner: agentOwnerId, limit: 1 }) : Promise.resolve(null)));
  const imageCount = property?.media.images.length || 0;

  useLockBodyScroll(lightboxOpen);

  // Count one view per visit for agent listings (not the owner viewing their own listing)
  useEffect(() => {
    if (!property || viewedRef.current === id) return;
    viewedRef.current = id;
    if (property.owner?.type === "agent" && property.owner.id !== user?.id) recordView(id);
  }, [id, property, user, recordView]);

  // Keyboard controls for the fullscreen gallery
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (event) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowRight") setActiveImage((i) => (i + 1) % imageCount);
      if (event.key === "ArrowLeft") setActiveImage((i) => (i - 1 + imageCount) % imageCount);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, imageCount]);

  if (detail.loading) return <PageLoader label="Loading property..." />;
  if (detail.error) {
    // 404: missing, unpublished or hidden. Anything else: the request failed, so offer a retry.
    if (/not found/i.test(detail.error)) return <NotFound message="Property not found. It may have been removed or is no longer listed." />;
    return (
      <div className="container-page grid min-h-[60vh] place-items-center py-16">
        <div role="alert" className="max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900">Unable to load this property</h1>
          <p className="mt-2 text-gray-600">{detail.error}</p>
          <button onClick={detail.reload} className="btn btn-primary mt-6">Retry</button>
        </div>
      </div>
    );
  }

  const { title, description, location: place, property: details, features, media, agent, meta } = property;
  const { value, period } = getPriceParts(property);
  const images = media.images;
  const liked = isFavorite(id);
  const isForSale = details.status === "Sale";

  // Contact always goes to the real owner: HomeBase (admin listings) or the listing agent
  const isAdminListing = property.owner.type === "admin";
  const availability = property.listing.availability;
  const unavailable = availability === "Sold" || availability === "Rented";
  const ownerName = isAdminListing ? settings.general.siteName : agent.name;
  const ownerPhone = isAdminListing ? settings.contact.phone : agent.phone;
  const ownerEmail = isAdminListing ? settings.contact.email : agent.email;
  const whatsappNumber = ownerWhatsAppNumber(property, settings);
  const whatsappLink = buildWhatsAppLink(whatsappNumber, property, window.location.href);
  const listingCount = agentListings.data?.total || 1;
  const isOwnListing = Boolean(user) && ((isAdminListing && user.role === "admin") || property.ownerUserId === user.id);
  // Rent Now needs a free property; Buy Now and offers are welcome until it is sold/rented
  const canPrimary = isForSale ? availability !== "Sold" : availability === "Available";
  const canMakeOffer = !unavailable;
  const primaryLabel = isForSale ? "Buy Now" : "Rent Now";
  const flowPaths = { buy: `/checkout/buy/${id}`, rent: `/checkout/rent/${id}`, offer: `/make-offer/${id}` };
  const contactLabel = isAdminListing ? siteName : "Agent";

  // The dialog opened by a click, or the one a returning guest asked for
  const resumeAction = user && !isOwnListing ? searchParams.get("action") : null;
  const activeDialog = dialog ?? (["chat", "inquiry"].includes(resumeAction) ? resumeAction : null);

  const closeDialog = () => {
    setDialog(null);
    if (searchParams.has("action")) setSearchParams({}, { replace: true });
  };

  // Guests can browse freely, but must sign in before offering, renting or contacting the owner
  const requireAuth = (action) => {
    if (user) return setDialog(action);
    setSignInFor(action);
  };

  // Rent Now / Buy Now / Make Offer continue on their own pages, which reload the property from the backend
  const startFlow = (flow) => {
    if (user) navigate(flowPaths[flow]);
    else setSignInFor(flow);
  };
  const startPrimary = () => startFlow(isForSale ? "buy" : "rent");

  const openLightbox = (index) => {
    setActiveImage(index);
    setLightboxOpen(true);
  };

  const stepImage = (step) => setActiveImage((i) => (i + step + images.length) % images.length);

  const specs = [
    details.bedrooms != null && { icon: Bed, label: "Bedrooms", value: details.bedrooms },
    details.bathrooms != null && { icon: Bath, label: "Bathrooms", value: details.bathrooms },
    details.size && { icon: Maximize2, label: "Size", value: `${details.size.value} ${details.size.unit}` },
    { icon: Building2, label: "Type", value: formatType(details.type) },
  ].filter(Boolean);

  const similar = related.data || []; // from GET /properties/:id/related

  const handleShare = async () => {
    const url = window.location.href;
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

  // WhatsApp is a link for signed-in customers and a sign-in prompt for guests
  const whatsAppAction = (className, children) =>
    user ? (
      <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    ) : (
      <button onClick={() => setSignInFor("whatsapp")} className={className}>
        {children}
      </button>
    );

  const sideImages = images.slice(1, 5);

  return (
    <div className="bg-linear-to-b from-brand-50/60 via-white to-white pb-36 lg:pb-12">
      <div className="container-page pt-6 sm:pt-10">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
          <Link to="/" className="hover:text-brand-600">Home</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to={isForSale ? "/sale" : "/rent"} className="hover:text-brand-600">{statusLabel(details.status)}</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate font-medium text-gray-900">{title}</span>
        </nav>

        {availability !== "Available" && (
          <p className={`mb-6 flex items-start gap-3 rounded-2xl p-4 text-sm ring-1 ${unavailable ? "bg-gray-900 text-white ring-gray-900" : "bg-amber-50 text-amber-900 ring-amber-100"}`}>
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            {unavailable
              ? `This property has been ${availability.toLowerCase()} and is no longer available. You can still contact the owner about similar properties.`
              : "This property is under offer. You can still contact the owner to register your interest."}
          </p>
        )}

        {/* Gallery */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className={`grid gap-3 ${sideImages.length ? "lg:grid-cols-4 lg:grid-rows-2" : ""}`}
        >
          <div className={`group relative overflow-hidden rounded-3xl bg-gray-100 ${sideImages.length ? "lg:col-span-2 lg:row-span-2" : ""}`}>
            <button onClick={() => openLightbox(activeImage)} aria-label="Open gallery" className="block h-full w-full">
              <img
                src={images[activeImage]}
                alt={title}
                fetchPriority="high"
                className={`h-full w-full object-cover transition duration-700 group-hover:scale-[1.03] aspect-4/3 sm:aspect-16/10 ${sideImages.length ? "lg:aspect-auto lg:min-h-112" : "lg:aspect-21/9"}`}
              />
            </button>
            <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-gray-900/50 via-transparent to-gray-900/10" />

            {/* Status chips */}
            <div className="pointer-events-none absolute top-4 left-4 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur ${isForSale ? "bg-emerald-50/95 text-emerald-700" : "bg-sky-50/95 text-sky-700"}`}>
                {statusLabel(details.status)}
              </span>
              {meta?.isFeatured && (
                <span className="flex items-center gap-1 rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                  <Star className="h-3 w-3 fill-white" />
                  Featured
                </span>
              )}
            </div>

            {/* Save / share */}
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                onClick={() => toggleFavorite(id)}
                aria-pressed={liked}
                aria-label={liked ? "Remove from saved" : "Save property"}
                className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-gray-900 shadow-sm backdrop-blur transition hover:scale-105 hover:bg-white"
              >
                <Heart className={`h-4 w-4 ${liked ? "fill-brand-500 text-brand-500" : ""}`} />
              </button>
              <button
                onClick={handleShare}
                aria-label={copied ? "Link copied" : "Share property"}
                className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-gray-900 shadow-sm backdrop-blur transition hover:scale-105 hover:bg-white"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
              </button>
            </div>

            {/* Mobile arrows + counter */}
            {images.length > 1 && (
              <>
                <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between lg:hidden">
                  <button onClick={() => stepImage(-1)} aria-label="Previous image" className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-gray-900 shadow-sm backdrop-blur">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button onClick={() => stepImage(1)} aria-label="Next image" className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-gray-900 shadow-sm backdrop-blur">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <button
                  onClick={() => openLightbox(activeImage)}
                  className="absolute right-4 bottom-4 flex items-center gap-1.5 rounded-full bg-gray-900/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-gray-900/85"
                >
                  <Images className="h-3.5 w-3.5" />
                  {activeImage + 1} / {images.length}
                </button>
              </>
            )}
          </div>

          {sideImages.map((image, i) => {
            const index = i + 1;
            const isLast = i === sideImages.length - 1 && images.length > 5;
            return (
              <button
                key={image}
                onClick={() => openLightbox(index)}
                aria-label={`Show image ${index + 1}`}
                className="group relative hidden overflow-hidden rounded-3xl bg-gray-100 lg:block"
              >
                <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                {isLast && (
                  <span className="absolute inset-0 grid place-items-center bg-gray-900/55 text-sm font-semibold text-white backdrop-blur-[2px]">
                    +{images.length - 5} photos
                  </span>
                )}
              </button>
            );
          })}
        </motion.div>

        {/* Mobile thumbnails */}
        {images.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar lg:hidden">
            {images.map((image, index) => (
              <button
                key={image}
                onClick={() => setActiveImage(index)}
                aria-label={`Show image ${index + 1}`}
                className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl ring-2 transition ${index === activeImage ? "ring-brand-500" : "ring-transparent opacity-60 hover:opacity-100"}`}
              >
                <img src={image} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-3 lg:gap-12">
          {/* Main column */}
          <div className="lg:col-span-2">
            {/* Title */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${isForSale ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-sky-50 text-sky-700 ring-sky-100"}`}>
                  {statusLabel(details.status)}
                </span>
                <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 capitalize ring-1 ring-brand-100">
                  {formatType(details.type)}
                </span>
                <StatusBadge status={availability} className="px-3 py-1" />
              </div>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-balance text-gray-900 sm:text-4xl">{title}</h1>
              <p className="mt-2 text-2xl font-extrabold tracking-tight text-brand-600 lg:hidden">
                {value}
                {period && <span className="text-base font-medium text-gray-500">{period}</span>}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-brand-500" />
                  {[place.name, place.city].filter(Boolean).join(", ")}
                </span>
                {meta?.rating && (
                  <span className="flex items-center gap-1.5">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <span className="font-semibold text-gray-900">{meta.rating.toFixed(1)}</span> rating
                  </span>
                )}
                {meta?.views && (
                  <span className="flex items-center gap-1.5">
                    <Eye className="h-4 w-4" />
                    {meta.views.toLocaleString()} views
                  </span>
                )}
              </div>
            </motion.div>

            {/* Key specs */}
            <Reveal className="mt-8 grid grid-cols-2 divide-gray-100 overflow-hidden rounded-3xl bg-white ring-1 ring-gray-100 shadow-sm sm:grid-cols-4 sm:divide-x">
              {specs.map((spec) => (
                <div key={spec.label} className="flex items-center gap-3 p-4 sm:flex-col sm:items-start sm:p-5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                    <spec.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-bold text-gray-900 capitalize">{spec.value}</span>
                    <span className="block text-xs text-gray-500">{spec.label}</span>
                  </span>
                </div>
              ))}
            </Reveal>

            {/* Key details */}
            <Reveal className="mt-6 rounded-3xl bg-white p-6 ring-1 ring-gray-100 sm:p-8">
              <SectionHeading>Overview</SectionHeading>
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                {[
                  ["Listing type", statusLabel(details.status)],
                  ["Property type", formatType(details.type)],
                  [isForSale ? "Asking price" : "Rent", `${value}${period}`],
                  ["Availability", availability],
                  ["Listed on", property.listing.createdAt ? formatDate(property.listing.createdAt) : "—"],
                  ["Property ID", id.slice(-8).toUpperCase()],
                ].map(([label, text]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">{label}</dt>
                    <dd className="mt-0.5 font-semibold text-gray-900 capitalize">{text}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>

            <Reveal className="mt-6 rounded-3xl bg-white p-6 ring-1 ring-gray-100 sm:p-8">
              <SectionHeading>About this property</SectionHeading>
              <p className={`mt-4 leading-relaxed whitespace-pre-line text-gray-600 ${expanded ? "" : "line-clamp-5"}`}>{description}</p>
              <button
                onClick={() => setExpanded((prev) => !prev)}
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-800"
              >
                {expanded ? "Show less" : "Read more"}
                <ChevronRight className={`h-4 w-4 transition ${expanded ? "-rotate-90" : "rotate-90"}`} />
              </button>
            </Reveal>

            {features?.length > 0 && (
              <Reveal className="mt-6 rounded-3xl bg-white p-6 ring-1 ring-gray-100 sm:p-8">
                <SectionHeading>What This Property Offers</SectionHeading>
                <ul className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm font-medium text-gray-800">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50">
                        <CheckCircle2 className="h-4 w-4 text-brand-500" />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            <Reveal className="mt-6 rounded-3xl bg-white p-6 ring-1 ring-gray-100 sm:p-8">
              <SectionHeading>Location</SectionHeading>
              <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25">
                  <MapPin className="h-7 w-7" />
                </span>
                <dl className="grid flex-1 grid-cols-2 gap-4 text-sm">
                  {/* Area-level details only; the exact address is shared by the owner directly */}
                  {[
                    ["Area", place.name],
                    ["City", place.city],
                    ["Region", place.region],
                    ["Country", COUNTRY],
                  ].map(([label, text]) => (
                    <div key={label}>
                      <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">{label}</dt>
                      <dd className="mt-0.5 font-semibold text-gray-900">{text || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>
          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="space-y-5 lg:sticky lg:top-28">
              <div className="overflow-hidden rounded-3xl bg-white shadow-xl ring-1 shadow-brand-900/5 ring-gray-100">
                {/* Price header */}
                <div className="relative bg-linear-to-br from-brand-500 to-brand-800 p-6 text-white">
                  <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10" />
                  <div className="relative flex items-center justify-between gap-3">
                    <p className="text-xs font-bold tracking-wider text-brand-100 uppercase">{statusLabel(details.status)}</p>
                    {availability !== "Available" && <StatusBadge status={availability} />}
                  </div>
                  <p className={`relative mt-1 ${unavailable ? "line-through decoration-2 opacity-70" : ""}`}>
                    <span className="text-3xl font-extrabold tracking-tight">{value}</span>
                    {period && <span className="text-base font-medium text-brand-100">{period}</span>}
                  </p>
                </div>

                <div className="p-6">
                  {isOwnListing ? (
                    <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">This is your listing. Offers, rentals and chats from customers appear in your dashboard.</p>
                  ) : (
                    <>
                      {/* Main action matches the listing: Rent Now for rentals, Buy Now for sales */}
                      <div className="grid gap-3">
                        <button onClick={startPrimary} disabled={!canPrimary} className="btn btn-primary w-full py-3.5 text-base">
                          {isForSale ? <ShoppingBag className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
                          {primaryLabel}
                        </button>
                        <button onClick={() => startFlow("offer")} disabled={!canMakeOffer} className="btn btn-light w-full py-3">
                          <HandCoins className="h-4 w-4" />
                          Make Offer
                        </button>
                      </div>
                      <p className="mt-2.5 text-center text-xs text-gray-500">
                        {!canPrimary
                          ? `This property is ${availability.toLowerCase()}. You can still contact the owner.`
                          : isForSale
                            ? "Request to buy, or offer your price. Payment is made at the office, never online."
                            : "Rent now and pay securely online, or offer your price first."}
                      </p>

                      <div className={`mt-5 grid gap-3 border-t border-dashed border-gray-200 pt-5 ${whatsappLink ? "grid-cols-2" : ""}`}>
                        <button onClick={() => requireAuth("chat")} className="btn btn-light px-3">
                          <MessageCircle className="h-4 w-4" />
                          Chat with {contactLabel}
                        </button>
                        {whatsappLink &&
                          whatsAppAction(
                            "btn bg-emerald-600 px-3 text-white hover:bg-emerald-700",
                            <>
                              <WhatsAppIcon />
                              WhatsApp
                            </>
                          )}
                      </div>
                      <button
                        onClick={() => requireAuth("inquiry")}
                        className="mx-auto mt-4 flex items-center gap-1.5 text-sm font-semibold text-gray-500 transition hover:text-brand-700"
                      >
                        <MessageSquare className="h-4 w-4" />
                        Prefer email? Send an inquiry
                      </button>
                    </>
                  )}

                  <p className="mt-5 flex items-center justify-center gap-1.5 border-t border-gray-100 pt-4 text-xs text-gray-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-brand-500" />
                    {isForSale ? "Always view a property before paying anything" : `Rental payments are verified by ${siteName}`}
                  </p>
                </div>
              </div>

              {/* Owner */}
              <div className="rounded-3xl bg-white p-6 ring-1 ring-gray-100">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Listed by</p>
                  <StatusBadge status={isAdminListing ? `${siteName} listing` : "Agent listing"} tone={isAdminListing ? "gray" : "brand"} dot={false} />
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-400 to-brand-700 text-lg font-bold text-white">
                    {isAdminListing ? <BadgeCheck className="h-7 w-7" /> : getInitials(ownerName)}
                    <span className="absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full bg-white">
                      <BadgeCheck className="h-4 w-4 text-brand-500" />
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-gray-900">{ownerName}</span>
                    <span className="block text-sm font-medium text-brand-700">{isAdminListing ? "Platform Admin" : "Verified Agent"}</span>
                    {!isAdminListing && (
                      <span className="block text-xs text-gray-500">{`${listingCount} ${listingCount === 1 ? "listing" : "listings"} on ${siteName}`}</span>
                    )}
                  </span>
                </div>
                <p className="mt-4 text-xs text-gray-500">Your offers and messages go directly to {isAdminListing ? `the ${siteName} team` : ownerName}.</p>
                {!user && (ownerPhone || ownerEmail) && (
                  <button
                    onClick={() => setSignInFor("contact")}
                    className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-left text-sm text-gray-600 transition hover:bg-brand-50 hover:text-brand-700"
                  >
                    <Lock className="h-4 w-4 shrink-0 text-brand-500" />
                    Sign in to see contact details
                  </button>
                )}
                {user && (ownerPhone || ownerEmail) && (
                  <div className="mt-5 space-y-2 text-sm">
                    {ownerPhone && (
                      <a href={`tel:${ownerPhone.replace(/\s+/g, "")}`} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-gray-700 transition hover:bg-brand-50 hover:text-brand-700">
                        <Phone className="h-4 w-4 shrink-0 text-brand-500" />
                        {ownerPhone}
                      </a>
                    )}
                    {ownerEmail && (
                      <a href={`mailto:${ownerEmail}`} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 break-all text-gray-700 transition hover:bg-brand-50 hover:text-brand-700">
                        <Mail className="h-4 w-4 shrink-0 text-brand-500" />
                        {ownerEmail}
                      </a>
                    )}
                  </div>
                )}
                {!isAdminListing && (
                  <Link to={`/agent/${agent.id}`} className="btn btn-light mt-5 w-full">
                    View agent profile
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          </aside>
        </div>

        {/* Similar */}
        {similar.length > 0 && (
          <section className="mt-20">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-brand-600">More to explore</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">Similar properties</h2>
              </div>
              <Link to={isForSale ? "/sale" : "/rent"} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-800">
                View all
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((item, index) => (
                <Reveal key={item.id} delay={index * 0.08} className="h-full">
                  <HouseCard house={item} />
                </Reveal>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Fullscreen gallery */}
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Property photos"
            className="fixed inset-0 z-50 flex flex-col bg-gray-950/95 backdrop-blur-sm"
            onClick={() => setLightboxOpen(false)}
          >
            <div className="flex items-center justify-between p-4 text-white" onClick={(event) => event.stopPropagation()}>
              <span className="text-sm font-medium text-gray-300">
                {activeImage + 1} / {images.length}
              </span>
              <button onClick={() => setLightboxOpen(false)} aria-label="Close gallery" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 sm:px-16">
              <motion.img
                key={images[activeImage]}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
                src={images[activeImage]}
                alt={`${title} photo ${activeImage + 1}`}
                onClick={(event) => event.stopPropagation()}
                className="max-h-full max-w-full rounded-2xl object-contain"
              />
              {images.length > 1 && (
                <>
                  <button
                    onClick={(event) => { event.stopPropagation(); stepImage(-1); }}
                    aria-label="Previous image"
                    className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-5"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(event) => { event.stopPropagation(); stepImage(1); }}
                    aria-label="Next image"
                    className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-5"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex justify-center gap-2 overflow-x-auto p-4 no-scrollbar" onClick={(event) => event.stopPropagation()}>
                {images.map((image, index) => (
                  <button
                    key={image}
                    onClick={() => setActiveImage(index)}
                    aria-label={`Show image ${index + 1}`}
                    className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 transition ${index === activeImage ? "ring-brand-400" : "ring-transparent opacity-50 hover:opacity-100"}`}
                  >
                    <img src={image} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <InquiryModal key={property.id} property={property} open={activeDialog === "inquiry"} onClose={closeDialog} />
      <StartChatModal key={`chat-${property.id}`} property={property} ownerName={ownerName} open={activeDialog === "chat"} onClose={closeDialog} />
      <SignInRequiredModal
        open={Boolean(signInFor)}
        onClose={() => setSignInFor(null)}
        returnTo={
          flowPaths[signInFor]
            ? flowPaths[signInFor]
            : ["chat", "inquiry"].includes(signInFor)
              ? `${location.pathname}?action=${signInFor}`
              : location.pathname
        }
      />

      {/* Phones: price and the main actions stay within reach */}
      {!isOwnListing && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-lg lg:hidden">
          <div className="mb-2 flex items-baseline justify-between">
            <p className={unavailable ? "text-gray-400 line-through" : ""}>
              <span className="text-lg font-extrabold text-gray-900">{value}</span>
              {period && <span className="text-xs font-medium text-gray-500">{period}</span>}
            </p>
            <span className="text-xs font-semibold text-gray-500 uppercase">{statusLabel(details.status)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={startPrimary} disabled={!canPrimary} className="btn btn-primary flex-1 px-3 py-2.5">
              {isForSale ? <ShoppingBag className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
              {primaryLabel}
            </button>
            <button onClick={() => startFlow("offer")} disabled={!canMakeOffer} className="btn btn-light flex-1 px-3 py-2.5">
              <HandCoins className="h-4 w-4" />
              Offer
            </button>
            {whatsappLink &&
              whatsAppAction(
                "btn bg-emerald-600 px-3 py-2.5 text-white hover:bg-emerald-700",
                <>
                  <WhatsAppIcon />
                  <span className="sr-only sm:not-sr-only">WhatsApp</span>
                </>
              )}
            <button onClick={() => requireAuth("chat")} aria-label={`Chat with ${contactLabel}`} className="btn btn-light px-3 py-2.5">
              <MessageCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const SectionHeading = ({ children }) => (
  <h2 className="flex items-center gap-3 text-xl font-bold text-gray-900 sm:text-2xl">
    <span className="h-6 w-1.5 rounded-full bg-brand-500" />
    {children}
  </h2>
);

export default PropertiesDetails;
