import {
  BadgeCheck,
  Bath,
  Bed,
  Eye,
  Heart,
  MapPin,
  Maximize2,
  Star,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useRealEstate } from "../../context/useRealEstate";
import {
  formatLocation,
  formatType,
  getInitials,
  getPriceParts,
  statusLabel,
} from "../../utils/property";
import { usePlatform } from "../../context/usePlatform";
import { useAuth } from "../../context/useAuth";
import { propertyCardImageSources } from "../../utils/propertyImages";
import { formatDistance } from "../../utils/geo";

const HouseCard = ({ house }) => {
  const { isFavorite, toggleFavorite } = useRealEstate();
  const { siteName } = usePlatform();
  const { isAuthenticated } = useAuth();
  const { id, title, location, property, media, meta } = house;
  const { value, period } = getPriceParts(house);
  const liked = isFavorite(id);
  const isForSale = property.status === "Sale";
  const isAgent = house.owner?.type === "agent";
  const agentName = isAgent
    ? isAuthenticated
      ? house.agent?.name || "Agent"
      : "Agent"
    : siteName;
  const unavailable = ["Sold", "Rented"].includes(house.listing?.availability);
  const identity =
    isAgent && !isAuthenticated ? (
      <span className="text-xs font-medium text-brand-600">
        Sign in to view agent
      </span>
    ) : (
      <>
        {house.agent?.profileImage && isAgent ? (
          <img
            src={house.agent.profileImage}
            alt=""
            loading="lazy"
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
            {getInitials(agentName)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-[10px] text-gray-500">Listed by</span>
          <span className="flex items-center gap-1 truncate text-xs font-semibold text-gray-700">
            {agentName}
            {isAgent && house.agent?.verified && (
              <BadgeCheck
                aria-label="Approved agent"
                className="h-3.5 w-3.5 shrink-0 text-brand-600"
              />
            )}
          </span>
          {isAgent &&
            house.agent?.agency?.name &&
            house.agent.agency.name !== agentName && (
              <span className="block truncate text-[10px] text-gray-500">
                {house.agent.agency.name}
              </span>
            )}
        </span>
      </>
    );

  return (
    <article className="@container group relative flex h-full flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-gray-200/80 glass-hover [--glass-lift:3px]">
      {/* Image */}
      <div className="relative aspect-4/3 overflow-hidden bg-gray-100">
        <img
          {...propertyCardImageSources(media.images[0])}
          alt={title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-105 group-hover:contrast-[1.03] group-hover:saturate-[1.08] group-has-focus-visible:scale-105"
        />
        <div className="absolute inset-0 bg-linear-to-t from-gray-950/70 via-transparent to-transparent" />

        <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-gray-900 shadow-sm backdrop-blur">
          <span
            className={`h-1.5 w-1.5 rounded-full ${isForSale ? "bg-emerald-500" : "bg-sky-500"}`}
          />
          {unavailable
            ? house.listing.availability
            : statusLabel(property.status)}
        </span>

        <button
          type="button"
          onClick={() => toggleFavorite(id)}
          aria-label={liked ? "Remove from favorites" : "Save to favorites"}
          aria-pressed={liked}
          className="absolute top-3 right-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow-sm backdrop-blur transition hover:scale-110 active:scale-95"
        >
          <Heart
            className={`h-5 w-5 transition-colors ${liked ? "fill-brand-500 text-brand-500" : "text-gray-700"}`}
          />
        </button>

        <p className="absolute bottom-4 left-4 text-white">
          <span className="text-2xl font-extrabold tracking-tight">
            {value}
          </span>
          {period && (
            <span className="text-sm font-medium text-white/80">{period}</span>
          )}
        </p>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold tracking-wider text-brand-600 uppercase">
            {formatType(property.type)}
          </span>
          {meta?.ratingCount > 0 && (
            <span
              className="flex items-center gap-1 text-sm font-semibold text-gray-700"
              aria-label={`Rated ${meta.rating.toFixed(1)} out of 5 from ${meta.ratingCount} ${meta.ratingCount === 1 ? "rating" : "ratings"}`}
            >
              <Star
                aria-hidden="true"
                className="h-4 w-4 fill-amber-400 text-amber-400"
              />
              {meta.rating.toFixed(1)}
              <span className="font-normal text-gray-400">
                ({meta.ratingCount})
              </span>
            </span>
          )}
        </div>

        <h3 className="text-lg font-bold text-gray-900 transition-colors group-hover:text-brand-600 group-has-focus-visible:text-brand-600">
          {/* Stretched link: the whole card is clickable, the heart button sits above it */}
          <Link to={`/house/${id}`} className="after:absolute after:inset-0">
            {title}
          </Link>
        </h3>

        <p className="mt-1 mb-4 flex items-center gap-1.5 text-sm text-gray-500">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate">{formatLocation(location)}</span>
          {house.distance != null && <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{formatDistance(house.distance, { approximate: location.approximate })}</span>}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-100 pt-4 text-sm text-gray-600">
          {property.bedrooms != null && (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Bed className="h-4 w-4 shrink-0 text-gray-400" />
              {property.bedrooms}{" "}
              <span className="hidden @[19rem]:inline">Beds</span>
            </span>
          )}
          {property.bathrooms != null && (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Bath className="h-4 w-4 shrink-0 text-gray-400" />
              {property.bathrooms}{" "}
              <span className="hidden @[19rem]:inline">Baths</span>
            </span>
          )}
          {property.size && (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Maximize2 className="h-4 w-4 shrink-0 text-gray-400" />
              {property.size.value} {property.size.unit}
            </span>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          {isAgent && !isAuthenticated ? (
            <Link
              to="/login"
              state={{ from: `/house/${id}` }}
              className="relative z-10 flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg hover:text-brand-600"
            >
              {identity}
            </Link>
          ) : isAgent && house.agent?.id ? (
            <Link
              to={`/agents/${house.agent.profileId}`}
              className="relative z-10 flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg hover:text-brand-600"
              aria-label={`View ${agentName}'s profile`}
            >
              {identity}
            </Link>
          ) : (
            <div className="flex min-h-11 min-w-0 items-center gap-2.5">
              {identity}
            </div>
          )}
          {meta?.views > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400 tabular-nums">
              <Eye aria-hidden="true" className="h-3.5 w-3.5" />
              {meta.views.toLocaleString()}
              <span className="sr-only @[19rem]:not-sr-only">
                {meta.views === 1 ? "view" : "views"}
              </span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
};

export default HouseCard;
