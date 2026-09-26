import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import {
  Bath,
  Bed,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
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
  Star,
} from "lucide-react";
import { useRealEstate } from "../context/useRealEstate";
import HouseCard from "../components/card/HouseCard";
import Reveal from "../components/ui/Reveal";
import NotFound from "./NotFound";
import PageLoader from "../components/ui/PageLoader";
import InquiryModal from "../components/InquiryModal";
import { useAuth } from "../context/useAuth";
import { usePlatform } from "../context/usePlatform";
import StartChatModal from "../components/chat/StartChatModal";
import WhatsAppIcon from "../components/ui/WhatsAppIcon";
import StatusBadge from "../components/ui/StatusBadge";
import { buildWhatsAppLink } from "../utils/whatsapp";
import { formatType, getInitials, getPriceParts, statusLabel } from "../utils/property";

const PropertiesDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { properties, propertiesLoading, agents, makeOffer, addToOffer, isFavorite, toggleFavorite, recordView } = useRealEstate();
  const { user } = useAuth();
  const { settings } = usePlatform();
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const viewedRef = useRef(null);
  const [activeImage, setActiveImage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const property = properties.find((item) => item.id === id);

  // Count one view per visit for agent listings (not the owner viewing their own listing)
  useEffect(() => {
    if (!property || viewedRef.current === id) return;
    viewedRef.current = id;
    if (property.owner?.type === "agent" && property.owner.id !== user?.id) recordView(id);
  }, [id, property, user, recordView]);

  if (!property && propertiesLoading) return <PageLoader label="Loading property..." />;

  if (!property) {
    return <NotFound message="This property doesn't exist or is no longer listed." />;
  }

  const { title, description, location: place, property: details, features, media, agent, meta } = property;
  const { value, period } = getPriceParts(property);
  const images = media.images;
  const liked = isFavorite(id);
  const inOffer = makeOffer.includes(id);
  const isForSale = details.status === "Sale";

  // Contact always goes to the real owner: HomeBase (admin listings) or the listing agent
  const isAdminListing = property.owner.type === "admin";
  const availability = property.listing.availability;
  const unavailable = availability === "Sold" || availability === "Rented";
  const ownerName = isAdminListing ? settings.platform.name : agent.name;
  const ownerPhone = isAdminListing ? settings.platform.phone : agent.phone;
  const ownerEmail = isAdminListing ? settings.platform.email : agent.email;
  const whatsappNumber = isAdminListing ? settings.contact?.whatsapp : agent.phone;
  const whatsappLink = buildWhatsAppLink(whatsappNumber, property, window.location.href);
  const agentProfile = !isAdminListing ? agents.find((a) => a.id === agent.id) : null;
  const listingCount = agentProfile?.properties.length || 1;
  const isOwnListing = Boolean(user) && ((isAdminListing && user.role === "admin") || property.ownerUserId === user.id);

  const openChat = () => {
    if (!user) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    setChatOpen(true);
  };

  const specs = [
    details.bedrooms != null && { icon: Bed, label: "Bedrooms", value: details.bedrooms },
    details.bathrooms != null && { icon: Bath, label: "Bathrooms", value: details.bathrooms },
    details.size && { icon: Maximize2, label: "Size", value: `${details.size.value} ${details.size.unit}` },
    { icon: Building2, label: "Type", value: formatType(details.type) },
  ].filter(Boolean);

  const similar = properties
    .filter((item) => item.id !== id && item.property.status === details.status)
    .sort((a, b) => Number(b.location.name === place.name) - Number(a.location.name === place.name))
    .slice(0, 3);

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

  const handleMakeOffer = () => {
    addToOffer(id);
    navigate("/offer");
  };

  return (
    <div className="bg-white pb-28 lg:pb-8">
      <div className="container-page pt-6 sm:pt-10">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
          <Link to="/" className="hover:text-brand-600">Home</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to={isForSale ? "/sale" : "/rent"} className="hover:text-brand-600">{statusLabel(details.status)}</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate font-medium text-gray-900">{title}</span>
        </nav>

        {/* Title row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isForSale ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
                {statusLabel(details.status)}
              </span>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 capitalize">
                {formatType(details.type)}
              </span>
              {meta?.isFeatured && (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Featured</span>
              )}
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-balance text-gray-900 sm:text-4xl lg:text-5xl">{title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-brand-500" />
                {place.address}, {place.name}, {place.city}
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
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleFavorite(id)}
              aria-pressed={liked}
              className={`btn btn-light ${liked ? "text-brand-600 ring-brand-200" : ""}`}
            >
              <Heart className={`h-4 w-4 ${liked ? "fill-brand-500 text-brand-500" : ""}`} />
              {liked ? "Saved" : "Save"}
            </button>
            <button onClick={handleShare} className="btn btn-light">
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
              {copied ? "Link copied" : "Share"}
            </button>
          </div>
        </motion.div>

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
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="overflow-hidden rounded-3xl bg-gray-100"
        >
          <img
            src={images[activeImage]}
            alt={title}
            fetchPriority="high"
            className="aspect-4/3 w-full object-cover sm:aspect-16/9 lg:aspect-21/9"
          />
        </motion.div>
        {images.length > 1 && (
          <div className="mt-3 flex gap-3 overflow-x-auto no-scrollbar">
            {images.map((image, index) => (
              <button
                key={image}
                onClick={() => setActiveImage(index)}
                aria-label={`Show image ${index + 1}`}
                className={`h-20 w-28 shrink-0 overflow-hidden rounded-xl ring-2 transition ${index === activeImage ? "ring-brand-500" : "ring-transparent opacity-70 hover:opacity-100"}`}
              >
                <img src={image} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-3 lg:gap-12">
          {/* Main column */}
          <div className="lg:col-span-2">
            <Reveal className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {specs.map((spec) => (
                <div key={spec.label} className="rounded-2xl bg-gray-50 p-4">
                  <spec.icon className="h-5 w-5 text-brand-500" />
                  <p className="mt-3 text-lg font-bold text-gray-900">{spec.value}</p>
                  <p className="text-xs text-gray-500">{spec.label}</p>
                </div>
              ))}
            </Reveal>

            <Reveal className="mt-10">
              <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">About this property</h2>
              <p className={`mt-4 leading-relaxed text-gray-600 ${expanded ? "" : "line-clamp-5"}`}>{description}</p>
              <button
                onClick={() => setExpanded((prev) => !prev)}
                className="mt-2 text-sm font-semibold text-brand-600 hover:text-brand-800"
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            </Reveal>

            {features?.length > 0 && (
              <Reveal className="mt-10">
                <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Features</h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            <Reveal className="mt-10">
              <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Location</h2>
              <dl className="mt-4 grid gap-3 rounded-2xl bg-gray-50 p-5 text-sm sm:grid-cols-2">
                {[
                  ["Address", place.address],
                  ["Neighbourhood", place.name],
                  ["City", place.city],
                  ["Region", place.region],
                ].map(([label, text]) => (
                  <div key={label}>
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="font-semibold text-gray-900">{text}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="space-y-5 lg:sticky lg:top-28">
              <div className="rounded-3xl bg-white p-6 shadow-xl ring-1 shadow-gray-900/5 ring-gray-100">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-500">{isForSale ? "Asking price" : "Rental price"}</p>
                  {availability !== "Available" && <StatusBadge status={availability} />}
                </div>
                <p className={`mt-1 ${unavailable ? "text-gray-400 line-through decoration-2" : ""}`}>
                  <span className={`text-3xl font-extrabold tracking-tight ${unavailable ? "" : "text-gray-900"}`}>{value}</span>
                  {period && <span className="text-base font-medium text-gray-500">{period}</span>}
                </p>

                {/* Contact the owner */}
                {isOwnListing ? (
                  <p className="mt-6 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">This is your listing. Customer chats appear in your Messages.</p>
                ) : (
                  <div className="mt-6 grid gap-3">
                    <button onClick={openChat} className="btn btn-primary w-full py-3.5">
                      <MessageCircle className="h-4 w-4" />
                      Chat with {isAdminListing ? "HomeBase" : "Agent"}
                    </button>
                    <div className="grid grid-cols-2 gap-3">
                      {whatsappLink && (
                        <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="btn bg-emerald-600 px-3 text-white hover:bg-emerald-700">
                          <WhatsAppIcon />
                          WhatsApp
                        </a>
                      )}
                      <button onClick={() => setInquiryOpen(true)} className={`btn btn-light px-3 ${whatsappLink ? "" : "col-span-2"}`}>
                        <MessageSquare className="h-4 w-4" />
                        Send inquiry
                      </button>
                    </div>
                  </div>
                )}

                {!unavailable && !isOwnListing && (
                  <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-5">
                    <button onClick={handleMakeOffer} className="btn btn-light flex-1 px-3">
                      <FileText className="h-4 w-4" />
                      Make an Offer
                    </button>
                    <button onClick={() => addToOffer(id)} disabled={inOffer} aria-label="Add to offer list" title={inOffer ? "In your offer list" : "Add to offer list"} className="btn btn-light px-4 disabled:opacity-100">
                      {inOffer ? <Check className="h-4 w-4 text-emerald-600" /> : "+"}
                    </button>
                  </div>
                )}
              </div>

              {/* Owner */}
              <div className="rounded-3xl bg-gray-50 p-6">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Listed by</p>
                  <StatusBadge status={isAdminListing ? "HomeBase listing" : "Agent listing"} tone={isAdminListing ? "gray" : "brand"} dot={false} />
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-500 text-lg font-bold text-white">
                    {isAdminListing ? <BadgeCheck className="h-7 w-7" /> : getInitials(ownerName)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-gray-900">{ownerName}</span>
                    <span className="text-sm text-gray-500">
                      {isAdminListing ? "Verified HomeBase listing" : `${listingCount} ${listingCount === 1 ? "listing" : "listings"} on HomeBase`}
                    </span>
                  </span>
                </div>
                <div className="mt-5 space-y-2 text-sm">
                  {ownerPhone && (
                    <a href={`tel:${ownerPhone.replace(/\s+/g, "")}`} className="flex items-center gap-2 text-gray-700 hover:text-brand-600">
                      <Phone className="h-4 w-4 text-gray-400" />
                      {ownerPhone}
                    </a>
                  )}
                  {ownerEmail && (
                    <a href={`mailto:${ownerEmail}`} className="flex items-center gap-2 break-all text-gray-700 hover:text-brand-600">
                      <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                      {ownerEmail}
                    </a>
                  )}
                </div>
                {!isAdminListing && (
                  <Link to={`/agent/${agent.id}`} className="btn btn-light mt-5 w-full bg-white">
                    View agent profile
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
              <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">Similar properties</h2>
              <Link to={isForSale ? "/sale" : "/rent"} className="text-sm font-semibold text-brand-600 hover:text-brand-800">
                View all
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

      <InquiryModal key={property.id} property={property} open={inquiryOpen} onClose={() => setInquiryOpen(false)} />
      <StartChatModal key={`chat-${property.id}`} property={property} ownerName={ownerName} open={chatOpen} onClose={() => setChatOpen(false)} />

      {/* Phones: contact actions stay within reach */}
      {!isOwnListing && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-lg lg:hidden">
          <div className={`grid gap-2 ${whatsappLink ? "grid-cols-3" : "grid-cols-2"}`}>
            <button onClick={openChat} className="btn btn-primary px-2 text-xs sm:text-sm">
              <MessageCircle className="h-4 w-4" />
              Chat
            </button>
            {whatsappLink && (
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="btn bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700 sm:text-sm">
                <WhatsAppIcon />
                WhatsApp
              </a>
            )}
            <button onClick={() => setInquiryOpen(true)} className="btn btn-light px-2 text-xs sm:text-sm">
              <MessageSquare className="h-4 w-4" />
              Inquiry
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertiesDetails;
