import { motion } from "motion/react";
import { Eye, HandCoins, Home, Inbox, MapPin, MapPinOff, Star } from "lucide-react";
import { hasMapPin } from "../../utils/geo";
import StatusBadge from "../ui/StatusBadge";
import ActionMenu from "../ui/ActionMenu";
import { formatDate } from "../../utils/date";
import { formatLocation, formatType, getPriceParts } from "../../utils/property";

// Availability shown on the photo; listing state (Published, In review...) sits in the footer
const AVAILABILITY_DOT = { Available: "bg-emerald-500", "Under Offer": "bg-amber-400", Rented: "bg-sky-500", Sold: "bg-gray-500" };

/**
 * A listing as the dashboards show it: photo first, then price, title and location,
 * with the owner, date and listing status underneath. Used for admin and agent property views.
 *  - status: the listing status label (Published, Pending Review, Draft, Hidden...)
 *  - owner: who listed it (agent name or the platform); omitted on the agent's own views
 *  - metrics: { views, offers, inquiries } when interest is tracked
 */
const PropertyTile = ({ property: p, status, owner, metrics, actions, onOpen, index = 0 }) => {
  const { value, period } = getPriceParts(p);
  const availability = p.listing.availability;
  const image = p.media.images[0];

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03, ease: "easeOut" }}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white glass-hover [--glass-shadow:0_8px_24px_-12px_rgb(17_24_39/0.16)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-500"
    >
      <div className="relative aspect-16/10 overflow-hidden bg-gray-100">
        {image ? (
          <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <span className="grid h-full place-items-center text-gray-300"><Home className="h-8 w-8" /></span>
        )}
        <span className="absolute top-2.5 left-2.5 rounded-md bg-gray-950/75 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase backdrop-blur-sm">
          {p.property.status === "Sale" ? "For sale" : "For rent"}
        </span>
        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-gray-800 shadow-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${AVAILABILITY_DOT[availability] || "bg-gray-400"}`} />
          {availability}
        </span>
        {p.meta?.isFeatured && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-md bg-amber-400 px-1.5 py-0.5 text-[11px] font-semibold text-amber-950">
            <Star className="h-3 w-3 fill-current" />
            Featured
          </span>
        )}
        {!hasMapPin(p) && (
          <span className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1 rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600 shadow-sm" title="Add a map pin in the editor so this listing appears in “near me” search">
            <MapPinOff className="h-3 w-3" aria-hidden="true" />
            No map pin
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-lg font-semibold tracking-tight text-gray-900 tabular-nums">
            {value}
            {period && <span className="text-xs font-medium text-gray-500">{period}</span>}
          </p>
          {actions && (
            <div className="relative z-10 -mt-1 -mr-2">
              <ActionMenu actions={actions} label={`Actions for ${p.title}`} />
            </div>
          )}
        </div>
        <h3 className="mt-0.5 truncate text-sm font-semibold text-gray-900">
          {onOpen ? (
            <button type="button" onClick={() => onOpen(p)} className="text-left after:absolute after:inset-0 focus-visible:outline-none">
              {p.title}
            </button>
          ) : (
            p.title
          )}
        </h3>
        <p className="mt-1 flex items-center gap-1 truncate text-xs text-gray-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{formatLocation(p.location)}</span>
          <span className="text-gray-300">·</span>
          <span className="shrink-0 capitalize">{formatType(p.property.type)}</span>
        </p>

        {metrics && (
          <dl className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-gray-50 px-3 py-2 text-xs">
            {[
              [Eye, "Views", metrics.views],
              [Inbox, "Inquiries", metrics.inquiries],
              [HandCoins, "Offers", metrics.offers],
            ].map(([Icon, label, count]) => (
              <div key={label} className="flex items-center gap-1.5" title={label}>
                <Icon className="h-3.5 w-3.5 text-gray-400" />
                <dt className="sr-only">{label}</dt>
                <dd className="font-semibold text-gray-800 tabular-nums">{(count || 0).toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs">
          <span className="min-w-0 truncate text-gray-500">
            {owner ? <span className="font-medium text-gray-700">{owner}</span> : null}
            {owner ? " · " : ""}
            {formatDate(p.listing.createdAt)}
          </span>
          {status && <StatusBadge status={status} />}
        </div>
      </div>
    </motion.article>
  );
};

export default PropertyTile;
